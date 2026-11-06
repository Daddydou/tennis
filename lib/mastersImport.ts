/**
 * IMPORT D'UN TOURNOI MASTERS depuis Game Tracker — construction PURE du plan (aucune écriture ici).
 *
 * L'API de picks de Game Tracker décrit un Masters (type FINALS) en 5 tours : « Poules · 1re/2e/3e journée »,
 * « Demi-finales », « Finale ». Pour chaque journée de poules, deux « pools » : `haut` (poule A) et `bas`
 * (poule B), chaque joueur portant son adversaire du jour dans `adversaires`. C'est donc la composition des
 * poules ET le calendrier des matchs de poule. La journée 1 est connue d'avance ; les journées 2 et 3 dépendent
 * de ses résultats (les vainqueurs se rencontrent, les perdants aussi, puis les duels restants) : Game Tracker ne
 * donne leurs adversaires qu'ensuite, et l'import se relance alors pour les ajouter (sans doublon). Les demies et
 * la finale n'ont pas de joueur avant la fin des poules.
 */
import { ROUNDS_MASTERS, type Moitie } from './masters';

export interface JoueurPoolGT {
  position: number;
  prenom: string | null;
  nom: string | null;
  adversaires: { position: number; prenom?: string | null; nom?: string | null }[];
}

export interface TourGT {
  numero: number;
  nom: string;
  pool?: { haut: JoueurPoolGT[]; bas: JoueurPoolGT[] };
}

export interface PicksGT {
  tournoi: { id: string; nom: string; tour: string; annee: number; type: string; surface: string | null; drawSize: number };
  tourOuvert: TourGT | null;
  toursAVenir: TourGT[];
}

export interface JoueurBase {
  id: string;
  name: string;
}

export interface MatchAImporter {
  round: (typeof ROUNDS_MASTERS)[number];
  roundOrder: number;
  position: number;
  half: Moitie;
  player1Id: string | null;
  player2Id: string | null;
  externalId: string;
}

export interface PlanMasters {
  tournoi: {
    externalId: string;
    name: string;
    tour: 'ATP' | 'WTA';
    category: 'finals';
    surface: 'hard' | 'clay' | 'grass' | 'carpet' | null;
    drawSize: 8;
    bestOf: 3;
    year: number;
    rounds: string[];
  };
  matchs: MatchAImporter[];
  /** Les 8 joueurs : poule -> ids (ordre de Game Tracker, par tête de série). */
  poules: { A: string[]; B: string[] };
  /** Journées de poules dont les duels ne sont pas encore connus (à importer plus tard). */
  joursManquants: ('J2' | 'J3')[];
}

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/** « Elena » + « RYBAKINA » -> le joueur de la base « E. Rybakina » (même nom de famille, même initiale). */
export function trouverJoueur(prenom: string | null, nom: string | null, joueurs: JoueurBase[]): { ok: true; id: string } | { ok: false; erreur: string } {
  const famille = norm(nom);
  const initiale = norm(prenom).slice(0, 1);
  const cands = joueurs.filter((j) => {
    const n = norm(j.name);
    const [ini, ...reste] = n.split(' ');
    return reste.join(' ') === famille && (!initiale || ini === initiale);
  });
  if (cands.length === 1) return { ok: true, id: cands[0].id };
  return { ok: false, erreur: cands.length === 0 ? `Joueur introuvable dans la base : ${prenom ?? ''} ${nom ?? ''}.` : `Joueur ambigu dans la base : ${prenom ?? ''} ${nom ?? ''}.` };
}

const SURFACES: [RegExp, 'hard' | 'clay' | 'grass' | 'carpet'][] = [
  [/hard/i, 'hard'],
  [/clay/i, 'clay'],
  [/grass/i, 'grass'],
  [/carpet/i, 'carpet'],
];

export function construirePlanMasters(
  picks: PicksGT,
  joueurs: JoueurBase[],
): { ok: true; plan: PlanMasters } | { ok: false; erreurs: string[] } {
  const erreurs: string[] = [];
  const t = picks.tournoi;
  if (t.type !== 'FINALS') erreurs.push(`Le tournoi Game Tracker n'est pas un Masters (type ${t.type}).`);
  if (t.tour !== 'ATP' && t.tour !== 'WTA') erreurs.push(`Circuit inconnu : ${t.tour}.`);
  if (t.drawSize !== 8) erreurs.push(`Un Masters compte 8 joueurs (Game Tracker : ${t.drawSize}).`);

  const tours = [picks.tourOuvert, ...picks.toursAVenir].filter((x): x is TourGT => x !== null);
  const idDe = new Map<number, string>(); // position Game Tracker -> id base
  const poules: { A: number[]; B: number[] } = { A: [], B: [] };
  const matchs: MatchAImporter[] = [];
  const joursManquants: ('J2' | 'J3')[] = [];

  for (const [i, round] of (['J1', 'J2', 'J3'] as const).entries()) {
    const tour = tours.find((x) => x.numero === i + 1);
    const sansAdversaire = !!tour?.pool && [...tour.pool.haut, ...tour.pool.bas].every((j) => j.adversaires.length === 0);
    if (round !== 'J1' && (!tour?.pool || sansAdversaire)) {
      joursManquants.push(round);
      continue;
    }
    if (!tour?.pool) {
      erreurs.push("La journée 1 des poules n'est pas (ou plus) dans la réponse de Game Tracker : l'import a besoin de la composition des poules.");
      continue;
    }
    for (const [cote, half, offset] of [['haut', 'top', 0], ['bas', 'bottom', 2]] as const) {
      const pool = tour.pool[cote];
      if (pool.length !== 4) {
        erreurs.push(`Journée ${i + 1}, poule ${cote === 'haut' ? 'A' : 'B'} : 4 joueurs attendus, ${pool.length} reçus.`);
        continue;
      }
      for (const j of pool) {
        const r = trouverJoueur(j.prenom, j.nom, joueurs);
        if (!r.ok) {
          if (!erreurs.includes(r.erreur)) erreurs.push(r.erreur);
          continue;
        }
        idDe.set(j.position, r.id);
        const cle = cote === 'haut' ? 'A' : 'B';
        if (!poules[cle].includes(j.position)) poules[cle].push(j.position);
      }
      // Les duels du jour : chaque joueur a un adversaire ; on garde chaque paire une fois, dans l'ordre des positions.
      const paires = new Map<string, [number, number]>();
      for (const j of pool) {
        const adv = j.adversaires[0]?.position;
        if (adv === undefined || !pool.some((x) => x.position === adv)) {
          erreurs.push(`Journée ${i + 1}, ${cote} : adversaire du jour manquant pour ${j.prenom} ${j.nom}.`);
          continue;
        }
        const [a, b] = [Math.min(j.position, adv), Math.max(j.position, adv)];
        paires.set(`${a}-${b}`, [a, b]);
      }
      const liste = [...paires.values()].sort((x, y) => x[0] - y[0]);
      if (liste.length !== 2) erreurs.push(`Journée ${i + 1}, ${cote} : 2 matchs attendus, ${liste.length} déduits.`);
      liste.forEach(([a, b], k) =>
        matchs.push({
          round,
          roundOrder: i + 1,
          position: offset + k,
          half,
          player1Id: idDe.get(a) ?? null,
          player2Id: idDe.get(b) ?? null,
          externalId: `gt:${t.id}:${round}:${offset + k}`,
        }),
      );
    }
  }
  if (erreurs.length) return { ok: false, erreurs };

  // Chaque joueur affronte les trois autres de sa poule, une fois : 6 matchs par poule.
  for (const [cle, moitie] of [['A', 'top'], ['B', 'bottom']] as const) {
    const ids = poules[cle].map((p) => idDe.get(p)!);
    const vus = new Set<string>();
    for (const m of matchs.filter((x) => x.half === moitie)) {
      const k = [m.player1Id, m.player2Id].sort().join('|');
      if (vus.has(k)) erreurs.push(`Poule ${cle} : un duel est programmé deux fois.`);
      vus.add(k);
    }
    const attendus = 2 * (3 - joursManquants.length);
    if (ids.length !== 4 || vus.size !== attendus) erreurs.push(`Poule ${cle} : 4 joueurs et ${attendus} duels différents attendus (${ids.length} joueurs, ${vus.size} duels).`);
  }
  if (erreurs.length) return { ok: false, erreurs };

  // Phase finale : matchs vides, joueurs connus une fois les poules jouées.
  matchs.push(
    { round: 'SF', roundOrder: 4, position: 0, half: 'top', player1Id: null, player2Id: null, externalId: `gt:${t.id}:SF:0` },
    { round: 'SF', roundOrder: 4, position: 1, half: 'bottom', player1Id: null, player2Id: null, externalId: `gt:${t.id}:SF:1` },
    { round: 'F', roundOrder: 5, position: 0, half: 'top', player1Id: null, player2Id: null, externalId: `gt:${t.id}:F:0` },
  );

  return {
    ok: true,
    plan: {
      tournoi: {
        externalId: `gt:${t.id}`,
        name: `${t.nom} ${t.annee}`,
        tour: t.tour as 'ATP' | 'WTA',
        category: 'finals',
        surface: SURFACES.find(([re]) => re.test(t.surface ?? ''))?.[1] ?? null,
        drawSize: 8,
        bestOf: 3,
        year: t.annee,
        rounds: [...ROUNDS_MASTERS],
      },
      matchs,
      poules: { A: poules.A.map((p) => idDe.get(p)!), B: poules.B.map((p) => idDe.get(p)!) },
      joursManquants,
    },
  };
}
