/**
 * IMPORT DE LA COUPE DAVIS (phase finale à 8 nations) depuis Game Tracker — construction PURE du plan.
 *
 * Game Tracker décrit la Coupe Davis comme un tableau à élimination directe de 8 « joueurs » (type DAVIS) :
 * les joueurs sont des NATIONS. Quarts de finale (picks : un par moitié), demi-finales, finale. C'est exactement
 * la forme d'un tableau de 8 chez nous : on crée donc un vrai tournoi (rounds QF, SF, F), dont les « joueurs »
 * sont des nations (tn_players, identifiant `davis-<code pays>`). Tout le reste de l'application (picks, bracket
 * de Thomas, alignement des tours verrouillés, bouton « Lire Game Tracker ») fonctionne alors sans cas particulier.
 *
 * Positions Game Tracker : 1 à 8, par paires de quarts (1-2, 3-4 | 5-6, 7-8) ; 1 à 4 = moitié haute.
 * Aucun import React / Next / Supabase ici.
 */

export const ROUNDS_DAVIS = ['QF', 'SF', 'F'] as const;
export const PREFIXE_ID_NATION = 'davis-';

export interface NationGT {
  position: number;
  nom: string | null;
  pays: string | null;
  adversaires: { position: number; nom?: string | null }[];
}

export interface PicksDavisGT {
  tournoi: { id: string; nom: string; tour: string; annee: number; type: string; surface: string | null; drawSize: number; statut?: string };
  tourOuvert: {
    numero: number;
    nom: string;
    lockAt?: string | null;
    pool?: { haut: NationGT[]; bas: NationGT[] };
  } | null;
}

export interface NationAImporter {
  id: string;
  /** Nom français tel que Game Tracker l'écrit (« Corée du Sud »). */
  name: string;
  /** Code pays à trois lettres (« KOR »). */
  country: string;
  position: number;
}

export interface MatchDavisAImporter {
  round: (typeof ROUNDS_DAVIS)[number];
  roundOrder: number;
  position: number;
  half: 'top' | 'bottom';
  player1Id: string | null;
  player2Id: string | null;
  externalId: string;
}

export interface PlanDavis {
  tournoi: {
    externalId: string;
    name: string;
    tour: 'ATP';
    category: 'davis';
    surface: 'hard';
    drawSize: 8;
    bestOf: 3;
    year: number;
    rounds: string[];
    /** Date (AAAA-MM-JJ, heure de Paris) du premier quart de finale. */
    debut: string | null;
    fin: string | null;
  };
  nations: NationAImporter[];
  matchs: MatchDavisAImporter[];
}

/** Identifiant interne d'une nation : `davis-ITA`. */
export const idNation = (pays: string) => `${PREFIXE_ID_NATION}${pays.toUpperCase()}`;

export const estIdNation = (id: string | null | undefined) => !!id && id.startsWith(PREFIXE_ID_NATION);

/** Jour calendaire (AAAA-MM-JJ) d'un instant UTC, à Paris. */
export function jourParis(isoUtc: string): string | null {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(d);
}

export function ajouterJours(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

/**
 * Construit le plan à partir de la réponse de l'API de picks (tour ouvert = quarts de finale).
 * Erreurs (rien n'est importé) : mauvais type, pas de quarts ouverts, pool incomplet, positions incohérentes.
 */
export function construirePlanDavis(picks: PicksDavisGT, opts: { debut?: string | null; fin?: string | null } = {}): { ok: true; plan: PlanDavis } | { ok: false; erreurs: string[] } {
  const erreurs: string[] = [];
  const t = picks.tournoi;
  if (t.type !== 'DAVIS') erreurs.push(`Ce tournoi Game Tracker n'est pas une Coupe Davis (type « ${t.type} »).`);
  if (t.drawSize !== 8) erreurs.push(`Tableau de ${t.drawSize} chez Game Tracker : seule la phase finale à 8 nations est prise en charge.`);
  const quarts = picks.tourOuvert;
  if (!quarts || !quarts.pool) erreurs.push('Les quarts de finale ne sont pas (ou plus) ouverts chez Game Tracker : impossible de lire les huit nations.');
  if (erreurs.length || !quarts?.pool) return { ok: false, erreurs };

  const entrees = [...quarts.pool.haut, ...quarts.pool.bas].sort((a, b) => a.position - b.position);
  if (entrees.length !== 8) erreurs.push(`${entrees.length} nations dans les quarts de finale (8 attendues).`);
  const positions = entrees.map((e) => e.position).join(',');
  if (positions !== '1,2,3,4,5,6,7,8') erreurs.push(`Positions Game Tracker inattendues : ${positions}.`);
  if (!quarts.pool.haut.every((e) => e.position <= 4) || !quarts.pool.bas.every((e) => e.position >= 5)) {
    erreurs.push('Le pool « haut » doit contenir les positions 1 à 4 et le pool « bas » les positions 5 à 8.');
  }
  const nations: NationAImporter[] = [];
  for (const e of entrees) {
    if (!e.nom || !e.pays) {
      erreurs.push(`Position ${e.position} : nation sans nom ou sans code pays chez Game Tracker.`);
      continue;
    }
    const voisine = e.position % 2 === 1 ? e.position + 1 : e.position - 1;
    if (e.adversaires.length !== 1 || e.adversaires[0].position !== voisine) {
      erreurs.push(`${e.nom} (position ${e.position}) : adversaire inattendu en quart (position ${voisine} attendue).`);
    }
    nations.push({ id: idNation(e.pays), name: e.nom, country: e.pays.toUpperCase(), position: e.position });
  }
  if (new Set(nations.map((n) => n.id)).size !== nations.length) erreurs.push('Deux nations ont le même code pays.');
  if (erreurs.length) return { ok: false, erreurs };

  const ext = `gt:${t.id}`;
  const parPosition = new Map(nations.map((n) => [n.position, n.id]));
  const matchs: MatchDavisAImporter[] = [];
  for (let i = 0; i < 4; i++) {
    matchs.push({
      round: 'QF',
      roundOrder: 1,
      position: i,
      half: i < 2 ? 'top' : 'bottom',
      player1Id: parPosition.get(2 * i + 1) ?? null,
      player2Id: parPosition.get(2 * i + 2) ?? null,
      externalId: `${ext}:QF:${i}`,
    });
  }
  for (let i = 0; i < 2; i++) {
    matchs.push({ round: 'SF', roundOrder: 2, position: i, half: i === 0 ? 'top' : 'bottom', player1Id: null, player2Id: null, externalId: `${ext}:SF:${i}` });
  }
  matchs.push({ round: 'F', roundOrder: 3, position: 0, half: 'top', player1Id: null, player2Id: null, externalId: `${ext}:F:0` });

  const debut = opts.debut ?? (quarts.lockAt ? jourParis(quarts.lockAt) : null);
  const fin = opts.fin ?? (debut ? ajouterJours(debut, 5) : null);
  return {
    ok: true,
    plan: {
      tournoi: {
        externalId: ext,
        name: `Coupe Davis ${t.annee}`,
        tour: 'ATP',
        category: 'davis',
        surface: 'hard',
        drawSize: 8,
        bestOf: 3,
        year: t.annee,
        rounds: [...ROUNDS_DAVIS],
        debut,
        fin,
      },
      nations,
      matchs,
    },
  };
}
