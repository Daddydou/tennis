// @vitest-environment node
/**
 * EXTRACTEURS — parité avec les snippets console d'origine.
 *
 * Chaque snippet (copie VERBATIM dans fixtures/snippet-*.js) est exécuté dans
 * jsdom sur le même HTML que l'extracteur porté ; le JSON qu'il « copie dans
 * le presse-papier » doit être identique au résultat de `extractAtp` /
 * `extractWta`, à `extracted_at` près (horodatage de l'exécution).
 *
 * WTA : vraie page Wuhan 2026 (réduite). ATP : fixture SYNTHÉTIQUE, faute de
 * vraie page sauvegardée (cf. son en-tête).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseHTML } from 'linkedom';
import { controlerExtrait, extractAtp, extractWta, extraireDepuisDocument, type ExtraitBrut } from '..';
import { parseExtract, verifierExtraction } from '@/lib/parser';

const fixture = (nom: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${nom}`, import.meta.url)), 'utf8');

const URL_WUHAN = 'https://www.wtatennis.com/tournaments/wuhan-open/draws';
const URL_ATP = 'https://www.atptour.com/en/scores/current/shanghai/5014/draws';

function dom(html: string, url: string) {
  return new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
}

/** Exécute un snippet dans jsdom et renvoie le JSON qu'il copie. */
async function executerSnippet(snippet: string, html: string, url: string): Promise<ExtraitBrut> {
  const { window } = dom(html, url);
  let copie: string | null = null;
  window.alert = () => {};
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: (s: string) => ((copie = s), Promise.resolve()) },
  });
  window.eval(snippet);
  await new Promise((r) => setTimeout(r, 0));
  if (copie === null) throw new Error('Le snippet n’a rien copié.');
  return JSON.parse(copie);
}

const sansHorodatage = (e: ExtraitBrut) => ({ ...e, extracted_at: null });

describe('WTA — Wuhan 2026 (vraie page, réduite)', () => {
  const html = fixture('wta-wuhan-2026.html');
  const extrait = extractWta(dom(html, URL_WUHAN).window.document, URL_WUHAN)!;

  it('parité exacte avec le snippet WTA', async () => {
    const attendu = await executerSnippet(fixture('snippet-wta.js'), html, URL_WUHAN);
    expect(sansHorodatage(extrait)).toEqual(sansHorodatage(attendu));
  });

  it('simple seul : 63 matchs R64 -> F, le double qui suit est ignoré', () => {
    expect(extrait.rounds_found).toEqual(['R64', 'R32', 'R16', 'QF', 'SF', 'F']);
    expect(extrait.match_count).toBe(63);
    expect(extrait.tournament).toEqual({ slug: 'wuhan-open', atp_id: null, year: new Date().getFullYear() });
    expect(extrait.tour).toBe('WTA');
  });

  it('cohérent avec la base pour Wuhan R64 (32 matchs joués, cf. WUHAN_R64_BASE)', () => {
    const r64 = extrait.matches.filter((m) => m.round === 'R64');
    expect(r64).toHaveLength(32);
    const vainqueurs = r64.map((m) => m.players.find((p) => p.winner)?.id ?? null);
    expect(vainqueurs).toEqual(WUHAN_R64_BASE);
  });

  it('passe parseExtract / verifierExtraction sans avertissement', () => {
    const c = controlerExtrait(extrait);
    expect(c).toEqual({ ok: true, avertissements: [], matchs: 63 });
    expect(verifierExtraction(parseExtract(extrait)).ok).toBe(true);
  });

  it('URL longue : id, slug et année lus dans le chemin', () => {
    const url = 'https://www.wtatennis.com/tournaments/1103/wuhan/2025/draws';
    const e = extractWta(dom(html, url).window.document, url)!;
    expect(e.tournament).toEqual({ slug: 'wuhan', atp_id: '1103', year: 2025 });
  });

  it('page sans tableau : null', () => {
    expect(extractWta(dom('<p>rien</p>', URL_WUHAN).window.document, URL_WUHAN)).toBeNull();
  });
});

describe('ATP — fixture synthétique', () => {
  const html = fixture('atp-synthetique.html');
  const extrait = extractAtp(dom(html, URL_ATP).window.document, URL_ATP)!;

  it('parité exacte avec le snippet ATP', async () => {
    const attendu = await executerSnippet(fixture('snippet-atp.js'), html, URL_ATP);
    expect(sansHorodatage(extrait)).toEqual(sansHorodatage(attendu));
  });

  it('statuts, BYE, tie-break, positions et métadonnées', () => {
    expect(extrait.tournament).toEqual({ slug: 'shanghai', atp_id: '5014', year: new Date().getFullYear() });
    expect(extrait.rounds_found).toEqual(['QF', 'SF', 'F']);
    expect(extrait.matches.map((m) => `${m.round}:${m.position}:${m.status}`)).toEqual([
      'QF:0:completed',
      'QF:1:walkover',
      'QF:2:retired',
      'QF:3:bye',
      'SF:0:live',
      'SF:2:scheduled',
      'F:0:scheduled',
    ]);
    const [qf0] = extrait.matches;
    expect(qf0.match_id).toBe('ms001');
    expect(qf0.players[0]).toMatchObject({ id: 'S0AG', seed: '1', country: 'ITA', winner: true });
    expect(qf0.players[0].sets[1]).toEqual({ games: 7, tiebreak: 7 });
    expect(qf0.players[1].country).toBe('AUS');
    expect(extrait.matches[3].players[1]).toMatchObject({ name: 'BYE', isBye: true, id: null });
  });

  it('archive avec année', () => {
    const url = 'https://www.atptour.com/en/scores/archive/madrid/1536/2025/draws';
    expect(extractAtp(dom(html, url).window.document, url)!.tournament).toEqual({
      slug: 'madrid',
      atp_id: '1536',
      year: 2025,
    });
  });
});

describe('linkedom (parseur du serveur) == jsdom', () => {
  // Le serveur lit les pages avec linkedom : jsdom ne se charge pas sur
  // Vercel (dépendance ESM requise en CommonJS). Même extraction exigée.
  const avecLinkedom = (html: string) => parseHTML(html).document as unknown as Document;

  it('WTA Wuhan', () => {
    const html = fixture('wta-wuhan-2026.html');
    const attendu = extractWta(dom(html, URL_WUHAN).window.document, URL_WUHAN)!;
    expect(sansHorodatage(extractWta(avecLinkedom(html), URL_WUHAN)!)).toEqual(sansHorodatage(attendu));
  });

  it('ATP synthétique', () => {
    const html = fixture('atp-synthetique.html');
    const attendu = extractAtp(dom(html, URL_ATP).window.document, URL_ATP)!;
    expect(sansHorodatage(extractAtp(avecLinkedom(html), URL_ATP)!)).toEqual(sansHorodatage(attendu));
  });
});

describe('aiguillage par domaine', () => {
  it('choisit l’extracteur selon l’hôte, null ailleurs', () => {
    const doc = dom(fixture('atp-synthetique.html'), URL_ATP).window.document;
    expect(extraireDepuisDocument(doc, URL_ATP)?.tour).toBe('ATP');
    expect(extraireDepuisDocument(doc, 'https://exemple.com/draws')).toBeNull();
  });

  it('controlerExtrait refuse le vide', () => {
    expect(controlerExtrait({ matches: [] })).toEqual({ ok: false, erreur: 'Aucun match dans cette extraction.' });
    expect(controlerExtrait(null).ok).toBe(false);
  });
});

/**
 * Vainqueurs R64 de Wuhan 2026 tels qu'en base (tn_matches.winner_id, par
 * position), relevés le 2026-10-15 en lecture seule.
 */
const WUHAN_R64_BASE: (string | null)[] = [
  '320760', '326096', '328818', '327845', '329409', '329651', '320277', '326408',
  '332285', '324261', '320983', '325639', '334183', '326160', '318312', '326482',
  '316738', '322222', '327391', '323087', '319280', '330364', '329918', '319001',
  '322191', '325725', '317683', '330482', '329824', '326735', '319939', '316956',
];
