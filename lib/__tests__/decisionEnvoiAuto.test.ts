// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decisionEnvoiAuto, type LigneEnvoi, type PreparationEnvoi } from '../gameTrackerPicks';
import { resumerLecture } from '../lectureGlobaleGT';

const ligne = (over: Partial<LigneEnvoi> = {}): LigneEnvoi => ({ cote: 'haut', origine: 'local', position: 3, nom: 'C. Alcaraz', enAttente: false, ...over });
const ok = (over: Partial<Extract<PreparationEnvoi, { ok: true }>> = {}): PreparationEnvoi => ({
  ok: true,
  tour: 6,
  roundLocal: 'F',
  haut: 3,
  bas: null,
  lignes: [ligne()],
  dejaAJour: false,
  avertissements: [],
  ...over,
});

describe('decisionEnvoiAuto', () => {
  it('pick validé, tour ouvert, différent de chez Game Tracker : on envoie', () => {
    expect(decisionEnvoiAuto(ok())).toEqual({ envoyer: true });
  });

  it('refus de preparerEnvoi (tour verrouillé, joueur hors pool...) : rien n\'est envoyé, la raison est donnée', () => {
    const d = decisionEnvoiAuto({ ok: false, raisons: ['Le tour « F » est verrouillé'] });
    expect(d).toMatchObject({ envoyer: false });
    expect((d as { message: string }).message).toContain('verrouillé');
  });

  it('Game Tracker a déjà ces picks : rien à envoyer', () => {
    expect(decisionEnvoiAuto(ok({ dejaAJour: true }))).toMatchObject({ envoyer: false });
  });

  it('une simple réservation ne part jamais toute seule', () => {
    const d = decisionEnvoiAuto(ok({ lignes: [ligne({ reserve: true })] }));
    expect(d).toMatchObject({ envoyer: false });
    expect((d as { message: string }).message).toContain('réservation');
  });

  it('un côté validé et un côté réservé : on n\'envoie pas (au moindre doute, rien)', () => {
    const d = decisionEnvoiAuto(ok({ lignes: [ligne({ cote: 'haut' }), ligne({ cote: 'bas', reserve: true })] }));
    expect(d).toMatchObject({ envoyer: false });
  });

  it('aucun pick de chez nous (que du « conservé ») : rien à envoyer', () => {
    expect(decisionEnvoiAuto(ok({ lignes: [ligne({ origine: 'conserve' })] }))).toMatchObject({ envoyer: false });
  });
});

describe('resumerLecture : bracket de Thomas', () => {
  const base = { ok: true as const, lie: true as const, alignement: { ok: true as const, changements: [], avertissements: [] }, resultatsRepris: [] };

  it('mentionne la synchro réussie', () => {
    expect(resumerLecture({ ...base, thomas: { ok: true } })).toEqual({ statut: 'lu', detail: 'bracket de Thomas synchronisé', attention: false });
  });

  it('une synchro ratée est à regarder, la lecture reste « lu »', () => {
    expect(resumerLecture({ ...base, thomas: { ok: false, message: 'panne' } })).toMatchObject({ statut: 'lu', attention: true });
  });

  it('sans information sur Thomas : comportement inchangé', () => {
    expect(resumerLecture(base)).toEqual({ statut: 'lu', detail: 'Rien de nouveau.', attention: false });
  });
});
