'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { supabaseAdmin } from '@/db/server';
import { recalculerPoints } from '@/db/points';
import { loadEngineData, tourCourantMatches } from '@/db/queries';
import {
  computeAndStoreProjections,
  invaliderProjections,
} from '@/db/projections';
import {
  computeAndStoreFantasy,
  enregistrerHistorique,
  equipeEvaluee,
  invaliderFantasy,
} from '@/db/fantasy';
import {
  parseExtract,
  extraireJoueurs,
  reconcilierIdsJoueurs,
  verifierExtraction,
  devinerBestOf,
} from '@/lib/parser';
import { detecterDoublons } from '@/lib/matching';
import { metaTournoi } from '@/lib/calendrier';
import { estIndecis } from '@/lib/types';
import type { DrawExtract, Match } from '@/lib/types';

export interface ImportResult {
  ok: boolean;
  error?: string;
  avertissements: string[];
  tournamentId?: string;
  resume?: {
    tournoi: string;
    joueurs: number;
    matchs: number;
    rounds: string[];
  };
}

const DRAW_FROM_ROUND: Record<string, number> = {
  R128: 128,
  R64: 64,
  R32: 32,
  R16: 16,
  QF: 8,
  SF: 4,
  F: 2,
};

/**
 * Nom affiché d'un tournoi.
 *
 * Priorité au libellé du référentiel (`lib/calendrier.ts`) : « canadian-open »
 * est l'Open du Canada, « china-open » Pékin — le slug seul induirait en
 * erreur. À défaut, on l'embellit ; et si l'extraction n'a même pas de slug,
 * on renvoie null pour que l'appelant décide (cf. `nomTournoi`).
 */
function prettifyName(slug: string | null): string | null {
  if (!slug) return null;
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Un slug non reconnu s'affiche BRUT plutôt que sous un nom générique : voir
 * « wuhan-open 2026 » dans la liste des tournois dit quelle fiche ajouter au
 * calendrier, là où « Tournoi 2026 » ne disait rien. Le générique ne reste
 * que pour une extraction sans slug du tout.
 */
function nomTournoi(nomFiche: string | null, slug: string | null): string {
  return nomFiche ?? prettifyName(slug) ?? 'Tournoi';
}

/** Sets orientés joueur1 : [{g1,g2,tb1,tb2}], sets vides ignorés. */
function setsJson(m: Match) {
  const [p1, p2] = m.players;
  const n = Math.max(p1.sets.length, p2.sets.length);
  const out: { g1: number | null; g2: number | null; tb1: number | null; tb2: number | null }[] =
    [];
  for (let i = 0; i < n; i++) {
    const g1 = p1.sets[i]?.games ?? null;
    const g2 = p2.sets[i]?.games ?? null;
    if (g1 === null && g2 === null) continue;
    out.push({
      g1,
      g2,
      tb1: p1.sets[i]?.tiebreak ?? null,
      tb2: p2.sets[i]?.tiebreak ?? null,
    });
  }
  return out;
}

export async function importerExtrait(jsonText: string): Promise<ImportResult> {
  // Une Server Action est un POST vers la route qui l'héberge, pas une route
  // distincte : la couverture du proxy ne suffit pas à la protéger.
  if (!(await sessionValide())) {
    return { ok: false, error: 'Non authentifié.', avertissements: [] };
  }

  // 1. Parse JSON brut
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'JSON invalide : impossible à parser.', avertissements: [] };
  }

  let extract: DrawExtract;
  try {
    extract = parseExtract(raw);
  } catch (e) {
    return {
      ok: false,
      error: `Extraction illisible : ${(e as Error).message}`,
      avertissements: [],
    };
  }

  if (extract.matches.length === 0) {
    return { ok: false, error: 'Aucun match dans cette extraction.', avertissements: [] };
  }

  const { avertissements } = verifierExtraction(extract);

  const sb = supabaseAdmin();

  // 1 bis. Réconciliation d'identité — retrouver un joueur déjà en base
  //    avant d'en créer un nouveau. Le site du circuit sert parfois, pour
  //    une joueuse non classée/qualifiée, un second espace d'identifiants
  //    (numérique) au lieu de l'ID habituel : sans ce rapprochement, chaque
  //    réapparition recrée une ligne tn_players neuve pour quelqu'un déjà
  //    en base (vu sur R. Jodar en juillet, migration 0011 ; puis sur neuf
  //    joueuses WTA à l'US Open de septembre — la fusion ponctuelle de
  //    l'époque n'empêchait rien, seul ce rapprochement en amont le peut).
  //    cf. lib/parser.ts `reconcilierIdsJoueurs` pour le détail et les
  //    garanties (jamais de fusion en cas d'homonymie ambiguë, ex. les deux
  //    « X. Wang »).
  const { data: joueursExistants, error: eExistants } = await sb
    .from('tn_players')
    .select('id, name')
    .eq('tour', extract.tour);
  if (eExistants) return { ok: false, error: `Joueurs existants : ${eExistants.message}`, avertissements };

  const { extract: extraitReconcilie, reconciliations, ambigus } = reconcilierIdsJoueurs(
    extract,
    joueursExistants ?? [],
  );
  extract = extraitReconcilie;
  for (const r of reconciliations) {
    avertissements.push(
      `« ${r.nom} » rapproché(e) du joueur déjà en base ${r.idExistant} (nouvel ID d'extraction ${r.idExtrait} ignoré, pas écrit).`,
    );
  }
  for (const a of ambigus) {
    avertissements.push(
      `« ${a.nom} » : nom ambigu (${a.candidats.join(', ')} en base) — ID ${a.idExtrait} de l'extraction conservé tel quel, PAS fusionné automatiquement.`,
    );
  }

  // 2. Joueurs : identité seulement. Les Elo réels (calculés match par match,
  //    source externe) vivent déjà dans tn_players et ne doivent PAS être
  //    écrasés. On les rechargera depuis la base pour la simulation.
  const players = extraireJoueurs(extract);

  // 3. Tournoi (upsert sur external_id, tour, year). Le `tour` de l'extraction
  //    est stocké tel quel : c'est lui qui décide ensuite du rapport Elo
  //    interrogé (`chargerIndexElo`), un tournoi WTA ne devant JAMAIS être
  //    rapproché des joueurs du circuit masculin.
  const slug = extract.tournament.slug;
  const bestOf = devinerBestOf(extract.tour, slug);
  const rounds = extract.roundsFound;
  const drawSize = DRAW_FROM_ROUND[rounds[0]] ?? null;

  // Surface / catégorie / date de début viennent du référentiel des tournois.
  // On n'utilise plus `devinerSurface(slug, mois)` : son repli calendaire
  // recevait le mois de l'EXTRACTION, pas celui du tournoi — importer un
  // tableau en juillet classait l'Australian Open sur gazon.
  const meta = metaTournoi(
    slug,
    extract.tour,
    extract.tournament.year,
    drawSize,
  );

  // Slug absent ou inconnu du référentiel : surface, catégorie et date ne sont
  // alors que des défauts. On le dit — dans le résultat de l'import, lu par
  // celui qui vient de coller le tableau, et dans les logs du serveur, qui
  // gardent la trace du slug exact à ajouter dans `lib/calendrier.ts`.
  if (!slug) {
    avertissements.push(
      "Extraction sans slug de tournoi (ni dans le JSON, ni dans son URL source) : " +
        'nom, surface et catégorie sont des valeurs par défaut.',
    );
    console.warn('[calendrier] extraction sans slug', {
      tour: extract.tour,
      sourceUrl: extract.sourceUrl,
    });
  } else if (!meta.reconnu) {
    avertissements.push(
      `Slug « ${slug} » inconnu du calendrier ${extract.tour} : surface ` +
        `« ${meta.surface} », catégorie « ${meta.categorie} » et date de début ` +
        'sont des valeurs par défaut. À ajouter dans lib/calendrier.ts.',
    );
    console.warn('[calendrier] slug inconnu', {
      slug,
      tour: extract.tour,
      annee: extract.tournament.year,
      sourceUrl: extract.sourceUrl,
    });
  }

  // Une date fournie par l'extraction prime sur celle du référentiel : le
  // bookmarklet n'en produit pas aujourd'hui, mais s'il évolue on la prend.
  const dateExtraite = (
    (raw as { tournament?: Record<string, unknown> })?.tournament ?? {}
  );
  const startDateBrute = dateExtraite.start_date ?? dateExtraite.startDate;
  const startDate =
    typeof startDateBrute === 'string' && /^\d{4}-\d{2}-\d{2}/.test(startDateBrute)
      ? startDateBrute.slice(0, 10)
      : meta.startDate;

  // Statut : terminé si la finale est jouée
  const finale = extract.matches.find(
    (m) => m.round === rounds[rounds.length - 1] && m.status === 'completed',
  );
  const status = finale ? 'completed' : 'running';

  const tournamentPayload = {
    external_id: extract.tournament.externalId,
    slug,
    name: `${nomTournoi(meta.nom, slug)} ${extract.tournament.year}`,
    tour: extract.tour,
    surface: meta.surface,
    category: meta.categorie,
    draw_size: drawSize,
    best_of: bestOf,
    year: extract.tournament.year,
    start_date: startDate,
    status,
    rounds,
  };

  let tournamentId: string;
  if (extract.tournament.externalId) {
    const { data, error } = await sb
      .from('tn_tournaments')
      .upsert(tournamentPayload, { onConflict: 'external_id,tour,year' })
      .select('id')
      .single();
    if (error) return { ok: false, error: `Tournoi : ${error.message}`, avertissements };
    tournamentId = data.id;
  } else {
    // Pas d'ID de circuit : on retrouve/insère à la main sur slug+tour+year
    const { data: existing } = await sb
      .from('tn_tournaments')
      .select('id')
      .eq('slug', slug ?? '')
      .eq('tour', extract.tour)
      .eq('year', extract.tournament.year)
      .maybeSingle();
    if (existing) {
      const { error } = await sb
        .from('tn_tournaments')
        .update(tournamentPayload)
        .eq('id', existing.id);
      if (error) return { ok: false, error: `Tournoi : ${error.message}`, avertissements };
      tournamentId = existing.id;
    } else {
      const { data, error } = await sb
        .from('tn_tournaments')
        .insert(tournamentPayload)
        .select('id')
        .single();
      if (error) return { ok: false, error: `Tournoi : ${error.message}`, avertissements };
      tournamentId = data.id;
    }
  }

  // 4. Joueurs (upsert sur id) — identité uniquement : on ne touche ni au rang
  //    ni aux colonnes Elo, renseignées par ailleurs avec des Elo réels.
  const playerPayload = Object.values(players).map((p) => ({
    id: p.id,
    tour: p.tour,
    name: p.name,
    country: p.country,
  }));
  if (playerPayload.length) {
    const { error } = await sb
      .from('tn_players')
      .upsert(playerPayload, { onConflict: 'id' });
    if (error) return { ok: false, error: `Joueurs : ${error.message}`, avertissements };
  }

  // 4 bis. GARDE-FOU — un doublon d'identité a-t-il malgré tout été écrit ?
  //
  // `reconcilierIdsJoueurs` (étape 1 bis) prévient déjà la récidive du bug
  // R. Jodar/WTA US Open (migrations 0011, 0019) en amont, mais reste un
  // rapprochement par NOM, seul signal disponible pour une joueuse non
  // classée — donc faillible (variante de nom que `normaliserNom` ne réduit
  // pas à la même clé, second appel d'écriture qui ne passerait pas par ce
  // même chemin, etc.). Les deux bugs précédents ne se sont vus qu'en
  // parcourant `tn_players` À LA MAIN, des semaines plus tard (migration
  // 0011 : « trois anomalies relevées en parcourant tn_players »). Ici, on
  // relit `tn_players` juste après l'écriture et on refuse l'import — plutôt
  // qu'un avertissement silencieux — si un doublon est passé au travers :
  // c'est le même principe que les contrôles de fin de migration 0011 §5 et
  // 0019 (« la migration échoue plutôt que de laisser passer un état
  // incohérent »), appliqué à l'écriture elle-même plutôt qu'à un script
  // relancé de temps en temps.
  const { data: joueursApresEcriture, error: eApres } = await sb
    .from('tn_players')
    .select('id, tour, name')
    .eq('tour', extract.tour);
  if (eApres) return { ok: false, error: `Vérification doublons : ${eApres.message}`, avertissements };

  const doublons = detecterDoublons(joueursApresEcriture ?? []);
  if (doublons.length > 0) {
    const detail = doublons
      .map((d) => `${d.lignes.map((l) => `${l.id} (${l.name})`).join(' / ')}`)
      .join(' | ');
    return {
      ok: false,
      error:
        `Import refusé : identité dupliquée détectée dans tn_players après écriture — ${detail}. ` +
        'Second espace d\'ID probable (cf. migrations 0011/0019) : vérifier si les deux ID sont bien ' +
        'la même personne puis fusionner par migration, ou déclarer une homonymie réelle dans ' +
        '`HOMONYMES_CONNUS` (lib/matching.ts) si ce sont deux joueuses distinctes.',
      avertissements,
    };
  }

  // 5. Matchs (upsert sur tournament_id, round, position)
  const roundOrder: Record<string, number> = {};
  rounds.forEach((r, i) => (roundOrder[r] = i + 1));

  const matchPayload = extract.matches.map((m) => {
    const [p1, p2] = m.players;
    const p1id = p1.isBye ? null : p1.id;
    const p2id = p2.isBye ? null : p2.id;
    // Un match sans issue connue n'a PAS de vainqueur, quoi qu'en dise
    // l'extraction : sur un tableau en direct, le bookmarklet peut marquer le
    // joueur qui mène. Le stocker ferait apparaître un vainqueur acquis là où
    // il n'y a qu'un score provisoire.
    const winnerId = estIndecis(m.status)
      ? null
      : (p1.winner && p1id) || (p2.winner && p2id) || null;
    return {
      tournament_id: tournamentId,
      external_id: m.matchId,
      round: m.round,
      round_order: roundOrder[m.round] ?? 0,
      position: m.position,
      half: m.half,
      player1_id: p1id,
      player2_id: p2id,
      winner_id: winnerId,
      sets: setsJson(m),
      status: m.status,
    };
  });

  if (matchPayload.length) {
    const { error } = await sb
      .from('tn_matches')
      .upsert(matchPayload, { onConflict: 'tournament_id,round,position' });
    if (error) return { ok: false, error: `Matchs : ${error.message}`, avertissements };
  }

  // 6. Points des picks. L'import est le moment où les résultats arrivent :
  //    on rescore immédiatement, sans attendre que l'utilisateur ouvre l'écran
  //    Résultats et clique « Recalculer ». Chaque pick est scoré contre son
  //    match, indépendamment des autres slots du tour.
  const scoring = await recalculerPoints(tournamentId);
  if (!scoring.ok) {
    avertissements.push(`Recalcul des points : ${scoring.error}`);
  }

  // 7. Cache des projections Monte Carlo. On invalide tout le cache du tournoi
  //    (les résultats du tour importé changent les survivants) puis on préchauffe
  //    le tour courant. Les autres tours seront simulés à la demande (et mis en
  //    cache) au premier affichage. Chaque simulation part des survivants réels
  //    du tour concerné (simulerDepuis) et coûte plusieurs secondes.
  //
  //    Le cache Fantasy (tn_fantasy) se périme aux mêmes moments — le tableau
  //    lui-même a pu changer, et les Elo avec. Il part en revanche TOUJOURS du
  //    tirage (espérance a priori, cf. db/fantasy.ts) : son préchauffage
  //    simule donc le premier tour, pas le tour courant. C'est une seconde
  //    simulation, mais c'est aussi celle dont l'écran Picks a besoin sur le
  //    premier tour — elle n'est pas perdue.
  try {
    await invaliderProjections(tournamentId);
    await invaliderFantasy(tournamentId);
    const engine = await loadEngineData(tournamentId);
    if (engine) {
      const rc = tourCourantMatches(engine.matchRows, engine.tournament.rounds ?? []);
      if (rc) await computeAndStoreProjections(engine, rc);
      const fantasy = await computeAndStoreFantasy(engine);

      // 7 bis. Couple prédit / réalisé. L'import est le moment où les résultats
      //        arrivent : c'est donc là que le score de l'équipe figée bouge.
      //        On enregistre, sans rien ajuster (cf. db/fantasy.ts).
      const hist = await enregistrerHistorique(engine, equipeEvaluee(engine, fantasy));
      if (!hist.ok) avertissements.push(`Historique Fantasy : ${hist.error}`);
    }
  } catch (e) {
    // La simulation ne doit pas faire échouer l'import lui-même.
    console.error('Projections (import):', (e as Error).message);
  }

  revalidatePath('/');
  revalidatePath('/fantasy');
  revalidatePath(`/tournoi/${tournamentId}`);
  revalidatePath(`/tournoi/${tournamentId}/tableau`);
  revalidatePath(`/tournoi/${tournamentId}/picks`);
  revalidatePath(`/tournoi/${tournamentId}/fantasy`);
  revalidatePath(`/tournoi/${tournamentId}/resultats`);

  return {
    ok: true,
    avertissements,
    tournamentId,
    resume: {
      tournoi: tournamentPayload.name,
      joueurs: playerPayload.length,
      matchs: matchPayload.length,
      rounds,
    },
  };
}
