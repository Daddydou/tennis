// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  contenuAEmpreinter,
  enPauseApresEchec,
  estDu,
  identiteCorrespond,
  modeParDefaut,
  motifArret,
  prochainPassage,
  urlSourceAutorisee,
} from '../importAutoRegles';
import type { DrawExtract } from '../types';

const T0 = new Date('2026-10-15T12:00:00Z');
const ilYa = (heures: number) => new Date(T0.getTime() - heures * 3600_000).toISOString();

describe('estDu', () => {
  it('actif jamais importé : dû', () => {
    expect(estDu({ actif: true, dernier_succes_at: null }, T0)).toBe(true);
  });
  it('dernier succès > 11 h 30 : dû ; < 11 h 30 : pas dû', () => {
    expect(estDu({ actif: true, dernier_succes_at: ilYa(11.6) }, T0)).toBe(true);
    expect(estDu({ actif: true, dernier_succes_at: ilYa(11.4) }, T0)).toBe(false);
  });
  it('inactif : jamais dû', () => {
    expect(estDu({ actif: false, dernier_succes_at: null }, T0)).toBe(false);
  });
  it('prochain passage = dernier succès + 11 h 30', () => {
    expect(prochainPassage({ actif: true, dernier_succes_at: ilYa(0) })?.toISOString()).toBe('2026-10-15T23:30:00.000Z');
    expect(prochainPassage({ actif: true, dernier_succes_at: null })).toBeNull();
  });
});

describe('pause après échec', () => {
  it('échec automatique < 1 h : pas de relance', () => {
    expect(enPauseApresEchec(ilYa(0.5), T0)).toBe(true);
    expect(enPauseApresEchec(ilYa(1.1), T0)).toBe(false);
    expect(enPauseApresEchec(null, T0)).toBe(false);
  });
});

describe('motifArret', () => {
  const base = { finaleGagnee: false, statutTournoi: 'running', dateFin: null, premierImportAt: ilYa(24) };
  it('rien : null', () => expect(motifArret(base, T0)).toBeNull());
  it('finale gagnée en base', () => expect(motifArret({ ...base, finaleGagnee: true }, T0)).toBe('finale_importee'));
  it('tournoi terminé', () => expect(motifArret({ ...base, statutTournoi: 'completed' }, T0)).toBe('fin_tournoi'));
  it('date de fin + 2 jours dépassée', () => {
    expect(motifArret({ ...base, dateFin: '2026-10-12' }, T0)).toBe('fin_tournoi');
    expect(motifArret({ ...base, dateFin: '2026-10-13' }, T0)).toBeNull();
  });
  it('plafond 21 jours', () => {
    expect(motifArret({ ...base, premierImportAt: ilYa(21 * 24 + 1) }, T0)).toBe('plafond_21j');
    expect(motifArret({ ...base, premierImportAt: ilYa(20 * 24) }, T0)).toBeNull();
  });
  it('la finale prime sur le reste', () => {
    expect(motifArret({ finaleGagnee: true, statutTournoi: 'completed', dateFin: '2026-01-01', premierImportAt: ilYa(999) }, T0)).toBe('finale_importee');
  });
});

describe('urlSourceAutorisee (garde-fou SSRF)', () => {
  it('site officiel du bon circuit, en https', () => {
    expect(urlSourceAutorisee('https://www.wtatennis.com/tournaments/wuhan-open/draws', 'WTA')).toBe(true);
    expect(urlSourceAutorisee('https://www.atptour.com/en/scores/current/shanghai/5014/draws', 'ATP')).toBe(true);
  });
  it('refuse autre circuit, http, autre hôte, port, identifiants, texte', () => {
    for (const [url, tour] of [
      ['https://www.atptour.com/x', 'WTA'],
      ['http://www.wtatennis.com/x', 'WTA'],
      ['https://www.wtatennis.com.evil.com/x', 'WTA'],
      ['https://evil.com/?u=https://www.wtatennis.com', 'WTA'],
      ['https://www.wtatennis.com:8443/x', 'WTA'],
      ['https://a:b@www.wtatennis.com/x', 'WTA'],
      ['http://169.254.169.254/latest', 'WTA'],
      ['pas une url', 'ATP'],
    ] as const) {
      expect(urlSourceAutorisee(url, tour), url).toBe(false);
    }
  });
});

describe('identiteCorrespond', () => {
  const extrait = (externalId: string | null, slug: string | null, tour: 'ATP' | 'WTA' = 'WTA', year = 2026) =>
    ({ tour, tournament: { externalId, slug, year } }) as unknown as DrawExtract;
  const wuhan = { external_id: null, slug: 'wuhan-open', tour: 'WTA', year: 2026 };
  it('même clé que l’import', () => {
    expect(identiteCorrespond(extrait(null, 'wuhan-open'), wuhan)).toBe(true);
    expect(identiteCorrespond(extrait('5014', 'shanghai', 'ATP'), { external_id: '5014', slug: 'shanghai', tour: 'ATP', year: 2026 })).toBe(true);
  });
  it('autre tournoi, autre circuit, autre année : refus', () => {
    expect(identiteCorrespond(extrait(null, 'china-open'), wuhan)).toBe(false);
    expect(identiteCorrespond(extrait(null, 'wuhan-open', 'ATP'), wuhan)).toBe(false);
    expect(identiteCorrespond(extrait(null, 'wuhan-open', 'WTA', 2025), wuhan)).toBe(false);
    expect(identiteCorrespond(extrait('1103', 'wuhan-open'), wuhan)).toBe(false);
    expect(identiteCorrespond(extrait(null, null), wuhan)).toBe(false);
  });
});

describe('divers', () => {
  it('mode par défaut : WTA serveur, ATP navigateur', () => {
    expect(modeParDefaut('WTA')).toBe('serveur');
    expect(modeParDefaut('ATP')).toBe('navigateur');
  });
  it('empreinte indépendante de l’horodatage et de l’URL', () => {
    const a = { extracted_at: '1', source_url: 'x', tournament: { slug: 's' }, tour: 'WTA', matches: [1] };
    const b = { ...a, extracted_at: '2', source_url: 'y' };
    expect(contenuAEmpreinter(a)).toBe(contenuAEmpreinter(b));
    expect(contenuAEmpreinter(a)).not.toBe(contenuAEmpreinter({ ...a, matches: [2] }));
  });
});

describe('mode api (API tennis)', () => {
  const URL_API = 'https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/tournament/atp/European%20Open%20-%20Brussels/2026/draws?fullBracket=true';

  it('dû toutes les 5 h 30 (cron toutes les 6 h)', async () => {
    expect(estDu({ actif: true, dernier_succes_at: ilYa(5.6), mode: 'api' }, T0)).toBe(true);
    expect(estDu({ actif: true, dernier_succes_at: ilYa(5.4), mode: 'api' }, T0)).toBe(false);
    // Les autres modes gardent 11 h 30.
    expect(estDu({ actif: true, dernier_succes_at: ilYa(5.6), mode: 'serveur' }, T0)).toBe(false);
  });

  it('inscription en mode api pour une URL de l’API du bon circuit seulement', async () => {
    const { modeParDefaut: mode, estUrlApi, urlSourceValide } = await import('../importAutoRegles');
    expect(mode('ATP', URL_API)).toBe('api');
    expect(mode('WTA', URL_API)).toBe('serveur');
    expect(estUrlApi(URL_API, 'ATP')).toBe(true);
    expect(estUrlApi(URL_API, 'WTA')).toBe(false);
    expect(urlSourceValide(URL_API, 'ATP')).toBe(true);
    expect(urlSourceValide('https://tennis-api-atp-wta-itf.p.rapidapi.com.evil.io/tennis/v2/tournament/atp/X/2026/draws', 'ATP')).toBe(false);
    expect(urlSourceValide('https://example.com/tennis/v2/tournament/atp/X/2026/draws', 'ATP')).toBe(false);
  });
});
