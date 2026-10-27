/**
 * ÉCRAN PLAN — la logique de l'écran, sans React : à partir des
 * `DonneesPlan` reçues du serveur, construit le « monde » (tableau, espérances,
 * écart-types) puis répond aux questions de l'écran :
 *
 *   - `planDe`            : le plan d'un participant pour un niveau d'agressivité,
 *                           en tenant compte des picks qu'il vient de choisir ;
 *   - `statsDuPlan`       : moyenne, mauvais cas, bon cas (par simulation) ;
 *   - `rechercheRivaux`   : les picks qui maximisent la chance de finir devant
 *                           les autres participants.
 *
 * Les tirages (coûteux) ne sont faits qu'à la première demande.
 */

import type { DonneesPlan, ParticipantDonnees } from './planDonnees';
import { planAvecPlanB, type PlanDetaille } from './planPicks';
import {
  bilan,
  chercherContreRivaux,
  creerContexte,
  type Bilan,
  type Contexte,
  totauxRivaux,
  type Participant,
  type ResultatRecherche,
} from './planRivaux';
import {
  creerTableauDepuisSpec,
  genererScenarios,
  propagerMoments,
  type Moments,
  type Tableau,
} from './planTableau';
import type { Half, Slot } from './types';

export type ModeAgressivite = 'prudent' | 'equilibre' | 'audacieux';

/**
 * Poids du risque k du plan « E + k·σ ». Calibré par simulation (cf.
 * recherche/plan-picks/agressivite.mts) : ±1 écart-type change nettement le
 * profil (mauvais cas / bon cas) pour une perte d'espérance de l'ordre de 0,5 pt.
 */
export const K_AGRESSIVITE: Record<ModeAgressivite, number> = {
  prudent: -1,
  equilibre: 0,
  audacieux: 1,
};

export interface Monde {
  d: DonneesPlan;
  t: Tableau;
  moments: Moments;
  moitieParId: Record<string, Half>;
  /** Les tirages, calculés à la première demande. */
  contexte(): Contexte;
}

export const cleSlot = (s: { round: string; half: Half | null }) => `${s.round}|${s.half ?? ''}`;

export function construireMonde(d: DonneesPlan, nbScenarios?: number): Monde {
  const blend = new Map<string, number>();
  for (const [a, b, p] of d.blend) {
    blend.set(`${d.joueurs[a].id}|${d.joueurs[b].id}`, p);
    blend.set(`${d.joueurs[b].id}|${d.joueurs[a].id}`, 1 - p);
  }
  const t = creerTableauDepuisSpec({
    ids: d.joueurs.map((j) => j.id),
    elo: d.joueurs.map((j) => j.elo),
    moitie: d.joueurs.map((j) => j.moitie),
    grille: d.grille,
    rounds: d.rounds,
    bestOf: d.bestOf,
    probabiliteMatch: (a, b, pElo) => blend.get(`${a}|${b}`) ?? pElo,
  });
  for (const f of d.fixes) t.fixer(f.a, f.b, { gagnantEstA: f.gagnantEstA, ptsA: f.ptsA, ptsB: f.ptsB });

  const moments = d.r0 < d.rounds.length ? propagerMoments(t, d.ouverture, d.r0) : { esp: {}, ecart: {}, presence: {} };
  const moitieParId: Record<string, Half> = {};
  t.ids.forEach((id, j) => (moitieParId[id] = t.moitie[j]));

  let ctx: Contexte | null = null;
  const S =
    nbScenarios ?? Math.max(400, Math.min(2000, Math.floor(60000 / Math.max(1, d.ouverture.filter((x) => x !== null).length))));

  return {
    d,
    t,
    moments,
    moitieParId,
    contexte() {
      if (!ctx) ctx = creerContexte(t, genererScenarios(t, d.ouverture, d.r0, S, 2026), moments.esp);
      return ctx;
    },
  };
}

/** Slots encore à jouer (tours r0 et suivants). */
export function slotsAJouer(d: DonneesPlan): Slot[] {
  return d.slots.filter((s) => d.rounds.indexOf(s.round) >= d.r0);
}

/** Slots à jouer qu'un participant n'a pas encore posés. */
export function slotsLibresDe(d: DonneesPlan, p: ParticipantDonnees): Slot[] {
  const poses = new Set(p.picks.map(cleSlot));
  return slotsAJouer(d).filter((s) => !poses.has(cleSlot(s)));
}

/** Joueurs déjà pickés par ce participant (indices). */
export function utilisesDe(p: ParticipantDonnees): Set<number> {
  return new Set(p.picks.map((k) => k.joueur));
}

/** Les picks d'un participant tels que `planRivaux` les attend, choix de l'écran compris. */
export function participantPourSimulation(d: DonneesPlan, p: ParticipantDonnees): Participant {
  const aJouer = slotsAJouer(d);
  const dejaPoses = new Set(p.picks.map(cleSlot));
  const base = p.picks
    .filter((k) => d.rounds.indexOf(k.round) < d.r0)
    .reduce((s, k) => s + (k.points ?? 0), 0);
  const places = p.picks
    .filter((k) => d.rounds.indexOf(k.round) >= d.r0)
    .map((k) => ({ round: k.round, half: k.half, joueur: k.joueur }));
  const utilises = utilisesDe(p);
  const libres: Slot[] = aJouer.filter((s) => !dejaPoses.has(cleSlot(s)));
  return { cle: p.id ?? 'moi', nom: p.nom, base, places, slotsLibres: libres, utilises };
}

/** Le plan d'un participant pour un niveau d'agressivité, avec les choix de l'écran gardés tels quels. */
export function planDe(
  m: Monde,
  p: ParticipantDonnees,
  mode: ModeAgressivite,
  choix: Record<string, number> = {},
): PlanDetaille {
  const { d } = m;
  const libres = slotsLibresDe(d, p);
  const imposes = libres
    .filter((s) => choix[cleSlot(s)] !== undefined)
    .map((s) => ({ round: s.round, half: s.half, playerId: d.joueurs[choix[cleSlot(s)]].id }));
  return planAvecPlanB({
    slots: libres,
    esperances: m.moments.esp,
    moitie: m.moitieParId,
    exclus: new Set([...utilisesDe(p)].map((j) => d.joueurs[j].id)),
    risque: { ecart: m.moments.ecart, k: K_AGRESSIVITE[mode] },
    imposes,
  });
}

/** Totaux simulés des rivaux (leur politique ne dépend pas de la mienne : à calculer une fois). */
export function totauxDesRivaux(m: Monde, rivaux: ParticipantDonnees[]): Float64Array[] {
  return rivaux.length ? totauxRivaux(m.contexte(), rivaux.map((r) => participantPourSimulation(m.d, r))) : [];
}

/**
 * Moyenne, mauvais cas, bon cas du plan, par simulation (le joueur visé
 * éliminé est remplacé au mieux). Avec `rivauxTot` : sa chance de finir devant eux.
 */
export function statsDuPlan(
  m: Monde,
  p: ParticipantDonnees,
  plan: PlanDetaille,
  rivauxTot: Float64Array[] = [],
): Bilan {
  // Les picks choisis à l'écran font partie du plan : ce sont des CIBLES, pas
  // des picks posés (le joueur visé peut encore être éliminé).
  const sim = participantPourSimulation(m.d, p);
  const cibles = sim.slotsLibres.map((s) => {
    const pk = plan.picks.find((q) => q.round === s.round && q.half === s.half);
    return pk ? m.d.joueurs.findIndex((j) => j.id === pk.playerId) : null;
  });
  return bilan(m.contexte(), sim, cibles, rivauxTot);
}

/** Les picks du prochain tour qui maximisent la chance de finir devant les rivaux. */
export function rechercheRivaux(
  m: Monde,
  moi: ParticipantDonnees,
  rivaux: ParticipantDonnees[],
  choix: Record<string, number> = {},
): ResultatRecherche {
  const { d } = m;
  const imposes = Object.entries(choix).map(([cle, joueur]) => {
    const [round, half] = cle.split('|');
    return { round, half: (half || null) as Half | null, joueur };
  });
  return chercherContreRivaux(
    m.contexte(),
    participantPourSimulation(d, moi),
    rivaux.map((r) => participantPourSimulation(d, r)),
    m.moments.esp,
    { imposes },
  );
}
