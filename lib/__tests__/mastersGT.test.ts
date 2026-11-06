// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { EtatGT, JoueurPoolGT, PickGT, TourJoueGT, TourOuvertGT } from '../gameTrackerPicks';
import { phaseDeRound, picksDepuisGT, positionsGT, preparerEnvoiMasters, roundDeTourGT, tourGTDeRound } from '../mastersGT';
import type { JoueurBase } from '../mastersImport';

const NOMS: [string, string][] = [
  ['Elena', 'RYBAKINA'], ['Coco', 'GAUFF'], ['Jessica', 'PEGULA'], ['Linda', 'NOSKOVA'],
  ['Aryna', 'SABALENKA'], ['Mira', 'ANDREEVA'], ['Elina', 'SVITOLINA'], ['Karolina', 'MUCHOVA'],
];
const BASE: JoueurBase[] = ['r', 'g', 'p', 'n', 's', 'a', 'v', 'm'].map((id, i) => ({ id, name: `${NOMS[i][0][0]}. ${NOMS[i][1][0]}${NOMS[i][1].slice(1).toLowerCase()}` }));
const nomDe = (id: string) => BASE.find((j) => j.id === id)?.name ?? id;

const pick = (position: number): PickGT => ({ position, prenom: NOMS[position - 1][0], nom: NOMS[position - 1][1] });
const joueur = (position: number, over: Partial<JoueurPoolGT> = {}): JoueurPoolGT => ({ ...pick(position), enAttente: false, dejaPicke: false, ...over });
const pool = (surcharge: Record<number, Partial<JoueurPoolGT>> = {}) => ({
  haut: [1, 2, 3, 4].map((p) => joueur(p, surcharge[p])),
  bas: [5, 6, 7, 8].map((p) => joueur(p, surcharge[p])),
});
const tour = (numero: number, nom: string, picksAttendus: 1 | 2, over: Partial<TourOuvertGT> = {}): TourOuvertGT => ({
  numero, nom, lockAt: null, picksAttendus, pool: picksAttendus === 2 ? pool() : { haut: [], bas: [] }, monPick: { haut: null, bas: null, etat: 'AUCUN' }, ...over,
});

function etat(over: Partial<EtatGT> = {}): EtatGT {
  return {
    maintenant: '2026-11-07T10:00:00.000Z',
    tournoi: { id: 'cmw3', nom: 'WTA Finals', drawSize: 8, statut: 'UPCOMING' },
    tourOuvert: tour(1, 'Poules · 1re journée', 2),
    toursAVenir: [tour(2, 'Poules · 2e journée', 2), tour(3, 'Poules · 3e journée', 2), tour(4, 'Demi-finales', 1), tour(5, 'Finale', 1)],
    dejaPickes: [],
    classement: [],
    tours: [],
    ...over,
  };
}

describe('tours Game Tracker <-> tours des Masters', () => {
  it('1, 2, 3 = journées, 4 = demies, 5 = finale', () => {
    expect([1, 2, 3, 4, 5].map(roundDeTourGT)).toEqual(['J1', 'J2', 'J3', 'SF', 'F']);
    expect(roundDeTourGT(6)).toBeNull();
    expect(['J1', 'J2', 'J3', 'SF', 'F'].map(tourGTDeRound)).toEqual([1, 2, 3, 4, 5]);
    expect(['J1', 'SF', 'F'].map(phaseDeRound)).toEqual(['poules', 'finale', 'finale']);
  });
});

describe('positionsGT', () => {
  it('rattache chaque position de Game Tracker (1 à 8) à nos joueuses, par le nom', () => {
    const p = positionsGT(etat(), BASE);
    expect(p.erreurs).toEqual([]);
    expect(p.parId.get('r')).toBe(1);
    expect(p.parId.get('m')).toBe(8);
    expect(p.parPosition.get(5)).toBe('s');
    expect(p.parId.size).toBe(8);
  });

  it('reprend les positions des picks déjà posés et des tours verrouillés même quand le pool n\'est plus là', () => {
    const e = etat({
      tourOuvert: null,
      toursAVenir: [tour(4, 'Demi-finales', 1)],
      tours: [{ numero: 1, nom: 'J1', statut: 'TERMINE', picks: [{ pseudo: 'Laki', moi: false, haut: pick(3), bas: pick(6), points: 12 }] }],
    });
    const p = positionsGT(e, BASE);
    expect(p.parPosition.get(3)).toBe('p');
    expect(p.parPosition.get(6)).toBe('a');
  });

  it('une joueuse inconnue est signalée', () => {
    expect(positionsGT(etat(), BASE.filter((j) => j.id !== 'n')).erreurs).toEqual(['Joueur introuvable dans la base : Linda NOSKOVA.']);
  });
});

describe('picksDepuisGT', () => {
  const positions = positionsGT(etat(), BASE);

  it('mes picks des tours à piquer : haut = poule A (top), bas = poule B (bottom) ; demie = un pick sans moitié', () => {
    const e = etat({
      tourOuvert: tour(1, 'J1', 2, { monPick: { haut: pick(1), bas: pick(6), etat: 'POSE' } }),
      toursAVenir: [tour(2, 'J2', 2), tour(3, 'J3', 2), tour(4, 'Demi-finales', 1, { monPick: { haut: pick(5), bas: null, etat: 'POSE' } }), tour(5, 'Finale', 1)],
    });
    const { picks, erreurs } = picksDepuisGT(e, positions, BASE);
    expect(erreurs).toEqual([]);
    expect(picks.map((x) => [x.pseudo, x.round, x.half, x.playerId, x.verrouille])).toEqual([
      ['moi', 'J1', 'top', 'r', false],
      ['moi', 'J1', 'bottom', 'a', false],
      ['moi', 'SF', null, 's', false],
    ]);
  });

  it('les tours verrouillés donnent les picks de tous (Game Tracker fait foi)', () => {
    const t1: TourJoueGT = {
      numero: 1,
      nom: 'J1',
      statut: 'VERROUILLE',
      picks: [
        { pseudo: 'Daddy', moi: true, haut: pick(1), bas: pick(5), points: null },
        { pseudo: 'Laki', moi: false, haut: pick(2), bas: null, points: null },
      ],
    };
    const { picks } = picksDepuisGT(etat({ tours: [t1] }), positions, BASE);
    expect(picks.filter((x) => x.verrouille).map((x) => [x.pseudo, x.moi, x.round, x.half, x.playerId])).toEqual([
      ['Daddy', true, 'J1', 'top', 'r'],
      ['Daddy', true, 'J1', 'bottom', 's'],
      ['Laki', false, 'J1', 'top', 'g'],
    ]);
  });
});

describe('preparerEnvoiMasters', () => {
  const positions = positionsGT(etat(), BASE);
  const prep = (numeroTour: number, souhaits: { half: 'top' | 'bottom' | null; playerId: string }[], e = etat()) =>
    preparerEnvoiMasters({ etat: e, numeroTour, souhaits, positions, nomDe });

  it('journée de poules : un pick par poule, positions de Game Tracker', () => {
    const r = prep(1, [{ half: 'top', playerId: 'r' }, { half: 'bottom', playerId: 'a' }]);
    expect(r).toMatchObject({ ok: true, tour: 1, round: 'J1', haut: 1, bas: 6, dejaAJour: false });
    if (r.ok) expect(r.lignes.map((l) => [l.cote, l.origine, l.position])).toEqual([['haut', 'souhait', 1], ['bas', 'souhait', 6]]);
  });

  it('un pick pour un tour à venir (picks à l\'avance) est permis', () => {
    expect(prep(3, [{ half: 'top', playerId: 'g' }, { half: 'bottom', playerId: 's' }])).toMatchObject({ ok: true, haut: 2, bas: 5 });
  });

  it('une seule poule renseignée : l\'autre côté garde le pick actuel de Game Tracker', () => {
    const e = etat({ tourOuvert: tour(1, 'J1', 2, { monPick: { haut: pick(4), bas: pick(8), etat: 'POSE' } }) });
    const r = prep(1, [{ half: 'top', playerId: 'r' }], e);
    expect(r).toMatchObject({ ok: true, haut: 1, bas: 8 });
    if (r.ok) expect(r.lignes[1].origine).toBe('conserve');
  });

  it('demie ou finale : un seul pick, côté « haut », sans moitié', () => {
    const e = etat({ toursAVenir: [tour(2, 'J2', 2), tour(3, 'J3', 2), tour(4, 'Demi-finales', 1, { pool: { haut: [joueur(1), joueur(2)], bas: [joueur(5), joueur(6)] } }), tour(5, 'Finale', 1)] });
    // Les candidates de la demie sont réparties entre « haut » et « bas » (poules) : on cherche des deux côtés,
    // et le pick part toujours dans le champ « haut ».
    expect(prep(4, [{ half: null, playerId: 's' }], e)).toMatchObject({ ok: true, tour: 4, round: 'SF', haut: 5, bas: null });
    expect(prep(4, [{ half: null, playerId: 'r' }], e)).toMatchObject({ ok: true, haut: 1, bas: null });
    // Une joueuse qui n'est dans aucun côté (éliminée en poules) : refus.
    expect(prep(4, [{ half: null, playerId: 'v' }], e).ok).toBe(false);
  });

  it('refus : joueuse d\'une autre poule, déjà pickée dans la phase, tour verrouillé, tour inconnu', () => {
    expect(prep(1, [{ half: 'top', playerId: 's' }])).toMatchObject({ ok: false });
    const dejaPickee = etat({ tourOuvert: tour(1, 'J1', 2, { pool: pool({ 1: { dejaPicke: true } }) }) });
    const r = prep(1, [{ half: 'top', playerId: 'r' }], dejaPickee);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raisons[0]).toMatch(/déjà pickée/);
    const verrou = etat({ tourOuvert: tour(1, 'J1', 2, { lockAt: '2026-11-07T09:00:00.000Z' }) });
    expect(prep(1, [{ half: 'top', playerId: 'r' }], verrou).ok).toBe(false);
    expect(prep(9, []).ok).toBe(false);
  });

  it('déjà à jour : Game Tracker a exactement ces picks', () => {
    const e = etat({ tourOuvert: tour(1, 'J1', 2, { monPick: { haut: pick(1), bas: pick(6), etat: 'POSE' } }) });
    expect(prep(1, [{ half: 'top', playerId: 'r' }, { half: 'bottom', playerId: 'a' }], e)).toMatchObject({ ok: true, dejaAJour: true });
  });

  it('joueuse « en attente » : signalée dans la ligne (le pick pourra être redirigé)', () => {
    const e = etat({ tourOuvert: tour(1, 'J1', 2, { pool: pool({ 1: { enAttente: true } }) }) });
    const r = prep(1, [{ half: 'top', playerId: 'r' }], e);
    if (!r.ok) throw new Error(r.raisons.join());
    expect(r.lignes[0].enAttente).toBe(true);
  });
});
