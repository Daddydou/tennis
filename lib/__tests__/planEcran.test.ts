import { describe, expect, it } from 'vitest';
import { construireDonneesPlan, type EntreeDonnees, type LigneMatch } from '../planDonnees';
import {
  cleSlot,
  construireMonde,
  participantPourSimulation,
  planDe,
  rechercheRivaux,
  slotsLibresDe,
  statsDuPlan,
} from '../planEcran';
import type { Match, MatchPlayer, Player } from '../types';

const ELOS = [2000, 1900, 1850, 1800, 1750, 1700, 1650, 1600];
const IDS = ELOS.map((_, i) => `J${i}`);
const players: Record<string, Player> = Object.fromEntries(
  IDS.map((id, i) => [
    id,
    { id, tour: 'ATP', name: `Joueur ${i}`, country: null, rank: i + 1, seed: null, half: i < 4 ? 'top' : 'bottom', eloOverall: ELOS[i], eloHard: ELOS[i], eloClay: ELOS[i], eloGrass: ELOS[i] } as Player,
  ]),
);
const mp = (id: string, winner = false): MatchPlayer => ({ id, name: id, seed: null, country: null, isBye: false, winner, sets: [] });

// 8 joueurs : QF (J0-J7) (J3-J4) | (J1-J6) (J2-J5), puis SF et F.
const QF: [string, string][] = [['J0', 'J7'], ['J3', 'J4'], ['J1', 'J6'], ['J2', 'J5']];
const matches: Match[] = QF.map(([a, b], i) => ({
  matchId: null, round: 'QF', roundLabel: 'QF', position: i, half: i < 2 ? 'top' : 'bottom', status: 'scheduled',
  players: [mp(a), mp(b)],
}));
const lignes = (decides: Record<number, string> = {}): LigneMatch[] => [
  ...QF.map(([a, b], i): LigneMatch => ({
    round: 'QF', position: i, player1_id: a, player2_id: b, winner_id: decides[i] ?? null, status: decides[i] ? 'completed' : 'scheduled',
  })),
  { round: 'SF', position: 0, player1_id: null, player2_id: null, winner_id: null, status: 'scheduled' },
  { round: 'SF', position: 1, player1_id: null, player2_id: null, winner_id: null, status: 'scheduled' },
  { round: 'F', position: 0, player1_id: null, player2_id: null, winner_id: null, status: 'scheduled' },
];

function entree(over: Partial<EntreeDonnees> = {}): EntreeDonnees {
  return {
    tournoiId: 't1', nom: 'Test', rounds: ['QF', 'SF', 'F'], bestOf: 3, surface: 'hard',
    matches, matchRows: lignes(), players,
    infoElo: {},
    participants: [{ id: null, nom: 'Moi' }, { id: 'L', nom: 'Laki' }, { id: 'T', nom: 'Thomas' }],
    picks: [],
    ...over,
  };
}

describe('construireDonneesPlan', () => {
  it('repère le premier tour non terminé et les participants à son ouverture', () => {
    const d = construireDonneesPlan(entree());
    expect(d.r0).toBe(0);
    expect(d.ouverture).toHaveLength(8);
    expect(d.fixes).toHaveLength(0);
  });

  it('un tour terminé est sauté : r0 avance et l\'ouverture vient des vainqueurs', () => {
    const rows = lignes({ 0: 'J0', 1: 'J3', 2: 'J1', 3: 'J2' }).map((r) => r);
    // Les lignes SF ne sont pas encore remplies : l'ouverture est reconstruite depuis les vainqueurs des QF.
    const d = construireDonneesPlan(entree({ matchRows: rows }));
    expect(d.r0).toBe(1);
    const noms = d.ouverture.map((j) => (j === null ? null : d.joueurs[j].id));
    expect(noms).toEqual(['J0', 'J3', 'J1', 'J2']);
  });

  it('un duel déjà joué dans le tour courant devient un duel fixe, avec ses points', () => {
    const rows = lignes({ 0: 'J7' });
    const mj = matches.map((m, i) =>
      i === 0 ? { ...m, status: 'completed' as const, players: [mp('J0'), mp('J7', true)] as [MatchPlayer, MatchPlayer] } : m,
    );
    const d = construireDonneesPlan(entree({ matchRows: rows, matches: mj }));
    expect(d.r0).toBe(0);
    expect(d.fixes).toHaveLength(1);
    expect(d.fixes[0].gagnantEstA).toBe(false);
  });

  it('range les picks de chaque participant par indice de joueur', () => {
    const d = construireDonneesPlan(
      entree({ picks: [{ participant_id: 'L', round: 'QF', half: 'top', player_id: 'J0', points: null }] }),
    );
    const laki = d.participants.find((p) => p.id === 'L');
    expect(laki?.picks).toHaveLength(1);
    expect(d.joueurs[laki!.picks[0].joueur].id).toBe('J0');
    expect(d.participants.find((p) => p.id === null)?.picks).toHaveLength(0);
  });
});

describe('écran plan', () => {
  const d = construireDonneesPlan(entree());
  const m = construireMonde(d, 1500);
  const moi = d.participants[0];

  it('chaque niveau d\'agressivité remplit tous les slots', () => {
    for (const mode of ['prudent', 'equilibre', 'audacieux'] as const) {
      const plan = planDe(m, moi, mode);
      expect(plan.picks.length + plan.sansJoueur.length).toBe(slotsLibresDe(d, moi).length);
      expect(plan.sansJoueur).toHaveLength(0);
      // Un joueur ne sert qu'une fois.
      expect(new Set(plan.picks.map((p) => p.playerId)).size).toBe(plan.picks.length);
    }
  });

  it('un pick choisi à l\'écran reste, et le reste du plan s\'adapte', () => {
    const libre = planDe(m, moi, 'equilibre');
    const premier = libre.picks[0];
    const autre = d.joueurs.findIndex((j) => j.id !== premier.playerId && j.moitie === (premier.half ?? j.moitie));
    const force = planDe(m, moi, 'equilibre', { [cleSlot(premier)]: autre });
    const pick = force.picks.find((p) => p.round === premier.round && p.half === premier.half);
    expect(pick?.playerId).toBe(d.joueurs[autre].id);
    expect(pick?.fixe).toBe(true);
    // Les autres slots n'utilisent pas le joueur imposé.
    expect(force.picks.filter((p) => p.playerId === d.joueurs[autre].id)).toHaveLength(1);
  });

  it('les statistiques du plan encadrent sa moyenne', () => {
    const s = statsDuPlan(m, moi, planDe(m, moi, 'equilibre'));
    expect(s.p10).toBeLessThanOrEqual(s.moyenne);
    expect(s.p90).toBeGreaterThanOrEqual(s.moyenne);
    expect(s.moyenne).toBeGreaterThan(10);
  });

  it('la recherche contre les rivaux tient compte de leurs picks déjà posés', () => {
    const d2 = construireDonneesPlan(
      entree({ picks: [{ participant_id: 'L', round: 'QF', half: 'top', player_id: 'J0', points: null }] }),
    );
    const m2 = construireMonde(d2, 1500);
    const [moi2, laki, thomas] = d2.participants;
    const res = rechercheRivaux(m2, moi2, [laki, thomas]);
    expect(res.recommandee.cibles).toHaveLength(slotsLibresDe(d2, moi2).length);
    expect(res.recommandee.bilan.pPremier).not.toBeNull();
    // Laki a déjà J0 : les ressources de Laki sont bien comptées côté simulation.
    const simLaki = participantPourSimulation(d2, laki);
    expect(simLaki.places).toHaveLength(1);
    expect(simLaki.slotsLibres).toHaveLength(slotsLibresDe(d2, laki).length);
  });
});
