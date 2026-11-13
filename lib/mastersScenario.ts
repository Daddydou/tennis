/**
 * COMPARAISON DES PRONOSTICS ET SCÉNARIO SIMULÉ D'UN MASTERS — module PUR (règles de points : lib/masters.ts).
 *
 * Un seul écran montre le pronostic de chaque participant côte à côte, jugé sur ce qui est DÉJÀ joué, et un
 * « bracket simulé » (même forme qu'un pronostic : classement des deux poules, vainqueurs des demies,
 * championne) que l'on modifie à volonté : les points de chacun se recalculent comme si ce scénario était la réalité.
 */
import { demisFinales, pointsPronostic, type PointsPronostic, type PronosticMasters, type ReelMasters } from './masters';
import { reelDepuisVue } from './mastersPronostic';
import { lignesPhaseFinale, pastillesPoule, type ParticipantPronostic, type VerdictMasters } from './mastersPronosticVue';
import type { VueMasters } from './mastersVue';

/** Remet d'équerre les vainqueurs de demie et la championne quand le classement change. */
export function corrigerPronostic(p: PronosticMasters): PronosticMasters {
  const [d1, d2] = demisFinales([p.classementA[0], p.classementA[1]], [p.classementB[0], p.classementB[1]]);
  const w1 = d1.includes(p.vainqueursDemis[0]) ? p.vainqueursDemis[0] : d1[0];
  const w2 = d2.includes(p.vainqueursDemis[1]) ? p.vainqueursDemis[1] : d2[0];
  return { ...p, vainqueursDemis: [w1, w2], champion: [w1, w2].includes(p.champion) ? p.champion : w1 };
}

/** Le scénario est une issue COMPLÈTE : tout y est « connu », donc tout compte dans les points. */
export function reelDepuisScenario(s: PronosticMasters): ReelMasters {
  return { classementA: s.classementA, classementB: s.classementB, finalistes: [...s.vainqueursDemis], champion: s.champion };
}

/** Ce qui est déjà joué dans la réalité et ne se simule donc plus. */
export interface FigeScenario {
  A: boolean;
  B: boolean;
  demis: [boolean, boolean];
  champion: boolean;
}

/**
 * Scénario de départ : la réalité là où elle est jouée (poule terminée sans égalité, demie jouée, finale jouée),
 * sinon le classement actuel de la poule et le mieux classé de chaque demie.
 */
export function scenarioInitial(vue: VueMasters): { scenario: PronosticMasters; fige: FigeScenario } {
  const reel = reelDepuisVue(vue);
  const ordre = (p: 'A' | 'B', jouee: string[] | null): string[] => {
    if (jouee) return jouee;
    const actuel = vue.poules[p].classement.map((l) => l.playerId);
    return actuel.length === vue.poules[p].joueurs.length ? actuel : vue.poules[p].joueurs;
  };
  const classementA = ordre('A', reel.classementA);
  const classementB = ordre('B', reel.classementB);
  const gagnantDemi = (i: 0 | 1) => vue.demis[i].match?.winnerId ?? null;
  const base = corrigerPronostic({
    classementA,
    classementB,
    vainqueursDemis: [gagnantDemi(0) ?? '', gagnantDemi(1) ?? ''],
    champion: vue.championId ?? '',
  });
  return {
    scenario: base,
    fige: {
      A: reel.classementA !== null,
      B: reel.classementB !== null,
      demis: [gagnantDemi(0) !== null, gagnantDemi(1) !== null],
      champion: vue.championId !== null,
    },
  };
}

/** Place `id` à la position `i` d'un classement en échangeant avec l'ancienne place de ce joueur (reste une permutation). */
export function placerDansClassement(classement: string[], i: number, id: string): string[] {
  const ancienne = classement.indexOf(id);
  const suivant = [...classement];
  if (ancienne === -1 || ancienne === i) return suivant;
  suivant[ancienne] = suivant[i];
  suivant[i] = id;
  return suivant;
}

export interface ParticipantScenario {
  cle: string;
  nom: string;
  pronostic: PronosticMasters | null;
  /** Points des picks (réels : le scénario ne simule pas les picks). */
  picks: number;
}

export interface LigneScenario {
  cle: string;
  nom: string;
  /** Points du pronostic sur ce qui est déjà joué (null = pas de pronostic). */
  actuel: PointsPronostic | null;
  /** Points du pronostic si le scénario se réalisait (null = pas de pronostic). */
  simule: PointsPronostic | null;
  picks: number;
  totalActuel: number;
  totalSimule: number;
  /** Rang dans le scénario ; les ex æquo partagent le rang (1, 1, 3). */
  rangSimule: number;
}

export function pointsSousScenario(participants: ParticipantScenario[], reel: ReelMasters, scenario: PronosticMasters): LigneScenario[] {
  const sim = reelDepuisScenario(scenario);
  const lignes = participants.map((p) => {
    const actuel = p.pronostic ? pointsPronostic(p.pronostic, reel) : null;
    const simule = p.pronostic ? pointsPronostic(p.pronostic, sim) : null;
    return {
      cle: p.cle,
      nom: p.nom,
      actuel,
      simule,
      picks: p.picks,
      totalActuel: (actuel?.total ?? 0) + p.picks,
      totalSimule: (simule?.total ?? 0) + p.picks,
      rangSimule: 0,
    };
  });
  lignes.sort((a, b) => b.totalSimule - a.totalSimule || a.nom.localeCompare(b.nom, 'fr'));
  lignes.forEach((l, i) => {
    l.rangSimule = i > 0 && l.totalSimule === lignes[i - 1].totalSimule ? lignes[i - 1].rangSimule : i + 1;
  });
  return lignes;
}

export interface CaseComparaison {
  joueurId: string;
  verdict: VerdictMasters;
}

export interface LigneComparaison {
  cle: string;
  libelle: string;
  /** Une case par participant, dans l'ordre reçu ; null = pas de pronostic. */
  cases: (CaseComparaison | null)[];
}

const PLACES = ['1er', '2e', '3e', '4e'];

/** La grille « un pronostic par colonne » : 8 places de poule, 2 vainqueurs de demie, la championne, avec le verdict de chaque case. */
export function grilleComparaison(vue: VueMasters, participants: ParticipantPronostic[]): LigneComparaison[] {
  const prevus = (p: 'A' | 'B') =>
    participants.map((x) => ({ cle: x.cle, nom: x.nom, classementPrevu: x.pronostic ? (p === 'A' ? x.pronostic.classementA : x.pronostic.classementB) : null }));
  const pastilles = { A: pastillesPoule(vue.poules.A, prevus('A')), B: pastillesPoule(vue.poules.B, prevus('B')) };
  const finale = lignesPhaseFinale(vue, participants);
  const deFinale = (cle: string) => finale.find((l) => l.cle === cle) ?? null;

  const lignes: LigneComparaison[] = [];
  for (const poule of ['A', 'B'] as const) {
    for (let i = 0; i < 4; i++) {
      lignes.push({
        cle: `${poule}${i + 1}`,
        libelle: `Poule ${poule} · ${PLACES[i]}`,
        cases: participants.map((x) => {
          const id = x.pronostic ? (poule === 'A' ? x.pronostic.classementA : x.pronostic.classementB)[i] : null;
          if (!id) return null;
          const verdict = pastilles[poule].get(id)?.find((q) => q.cle === x.cle && q.rang === i + 1)?.verdict ?? 'attente';
          return { joueurId: id, verdict };
        }),
      });
    }
  }
  for (const i of [0, 1] as const) {
    lignes.push({
      cle: `D${i + 1}`,
      libelle: `Demie ${i + 1} · vainqueur`,
      cases: participants.map((x) => {
        const f = deFinale(x.cle)?.finalistes[i];
        return f ? { joueurId: f.joueurId, verdict: f.verdict } : null;
      }),
    });
  }
  lignes.push({
    cle: 'C',
    libelle: 'Championne',
    cases: participants.map((x) => {
      const c = deFinale(x.cle)?.champion;
      return c ? { joueurId: c.joueurId, verdict: c.verdict } : null;
    }),
  });
  return lignes;
}
