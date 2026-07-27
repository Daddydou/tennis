/**
 * RAPPORTS ELO TENNIS ABSTRACT — RÉCUPÉRATION ET PARSING
 *
 * https://tennisabstract.com/reports/atp_elo_ratings.html (et wta_)
 *
 * Pages HTML statiques, rendues côté serveur : un simple fetch suffit, aucun
 * JS à exécuter. Le tableau utile porte `id="reportable"`. On repère les
 * colonnes par leur INTITULÉ et non par leur position : le rapport en compte
 * 17, dont des colonnes d'espacement vides, et l'ordre peut bouger.
 *
 * Le parsing est volontairement séparé du fetch : il est testable sur un
 * fichier HTML capturé, sans réseau.
 */

export type TourTa = 'atp' | 'wta';

export const URLS_RAPPORTS: Record<TourTa, string> = {
  atp: 'https://tennisabstract.com/reports/atp_elo_ratings.html',
  wta: 'https://tennisabstract.com/reports/wta_elo_ratings.html',
};

export interface LigneRapport {
  nom: string;
  /**
   * Identifiant Tennis Abstract, lu dans l'URL du joueur
   * (player.cgi?p=AndresMartin). C'est la SEULE identité fiable : deux
   * homonymes ont des slugs distincts (AndrejMartin / AndresMartin) là où
   * leurs noms normalisés sont identiques.
   */
  slug: string;
  eloOverall: number | null;
  eloHard: number | null;
  eloClay: number | null;
  eloGrass: number | null;
  rang: number | null;
}

export interface RapportElo {
  tour: TourTa;
  /** Date « Last update » annoncée en tête du rapport (YYYY-MM-DD). */
  misAJourLe: string | null;
  lignes: LigneRapport[];
}

/** Retire les balises et décode les entités utilisées par le rapport. */
function texte(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function nombre(s: string): number | null {
  const t = s.replace(/[^0-9.\-]/g, '');
  if (!t || t === '-' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function cellules(ligneHtml: string, balise: 'td' | 'th'): string[] {
  const re = new RegExp(`<${balise}[^>]*>([\\s\\S]*?)<\\/${balise}>`, 'gi');
  return [...ligneHtml.matchAll(re)].map((m) => m[1]);
}

/**
 * Parse un rapport Elo Tennis Abstract.
 * @throws si le tableau ou les colonnes attendues sont introuvables — mieux
 *         vaut un refresh en échec qu'une table d'Elo silencieusement vide.
 */
export function parserRapportElo(html: string, tour: TourTa): RapportElo {
  const debut = html.indexOf('id="reportable"');
  if (debut === -1) {
    throw new Error('Tableau « reportable » introuvable : format de page modifié ?');
  }
  const tableau = html.slice(debut);

  const thead = tableau.slice(tableau.indexOf('<thead'), tableau.indexOf('</thead>'));
  const entetes = cellules(thead, 'th').map((c) => texte(c).toLowerCase());

  const colonne = (...libelles: string[]) => {
    for (const l of libelles) {
      const i = entetes.indexOf(l);
      if (i !== -1) return i;
    }
    return -1;
  };

  const iNom = colonne('player');
  const iElo = colonne('elo');
  const iHard = colonne('helo');
  const iClay = colonne('celo');
  const iGrass = colonne('gelo');
  // « ATP Rank » ou « WTA Rank » selon le circuit.
  const iRang = colonne(`${tour} rank`, 'atp rank', 'wta rank');

  if (iNom === -1 || iElo === -1) {
    throw new Error(
      `Colonnes attendues absentes (Player/Elo). Intitulés lus : ${entetes.join(' | ')}`,
    );
  }

  const debutCorps = tableau.indexOf('<tbody');
  const finCorps = tableau.indexOf('</tbody>');
  if (debutCorps === -1 || finCorps === -1) {
    throw new Error('Corps du tableau introuvable : format de page modifié ?');
  }
  const corps = tableau.slice(debutCorps, finCorps);

  const lignes: LigneRapport[] = [];
  for (const brute of corps.split(/<tr[^>]*>/i).slice(1)) {
    const tds = cellules(brute, 'td');
    if (tds.length <= iElo) continue;

    const nom = texte(tds[iNom] ?? '');
    if (!nom) continue;

    // Le slug vit dans le lien de la cellule « Player ». Repli sur le nom
    // sans espaces : c'est la règle de construction des slugs TA
    // (« Tomas Martin Etcheverry » → « TomasMartinEtcheverry »), ce qui
    // laisse une identité utilisable si le lien venait à disparaître.
    const lien = (tds[iNom] ?? '').match(/player\.cgi\?p=([^"'&\s]+)/i);
    const slug = lien
      ? decodeURIComponent(lien[1])
      : nom.replace(/\s+/g, '');

    lignes.push({
      nom,
      slug,
      eloOverall: nombre(texte(tds[iElo] ?? '')),
      eloHard: iHard === -1 ? null : nombre(texte(tds[iHard] ?? '')),
      eloClay: iClay === -1 ? null : nombre(texte(tds[iClay] ?? '')),
      eloGrass: iGrass === -1 ? null : nombre(texte(tds[iGrass] ?? '')),
      rang: iRang === -1 ? null : nombre(texte(tds[iRang] ?? '')),
    });
  }

  if (lignes.length === 0) {
    throw new Error('Aucune ligne de joueur extraite : format de page modifié ?');
  }

  const maj = html.match(/Last update:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);

  return { tour, misAJourLe: maj?.[1] ?? null, lignes };
}

/** Télécharge et parse le rapport d'un circuit. */
export async function recupererRapportElo(tour: TourTa): Promise<RapportElo> {
  const res = await fetch(URLS_RAPPORTS[tour], {
    // Rapport hebdomadaire : rien à mettre en cache côté Next, le refresh
    // est déclenché à la main et doit voir la page telle qu'elle est.
    cache: 'no-store',
    headers: { 'User-Agent': 'tennis-picks/1.0 (import Elo hebdomadaire)' },
  });
  if (!res.ok) {
    throw new Error(`${URLS_RAPPORTS[tour]} : HTTP ${res.status}`);
  }
  return parserRapportElo(await res.text(), tour);
}
