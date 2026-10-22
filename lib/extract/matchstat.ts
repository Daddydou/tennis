/**
 * TABLEAU DEPUIS L'API TENNIS (Matchstat, via RapidAPI) — conversion pure.
 *
 * Transforme la réponse de
 *   GET /tennis/v2/tournament/{atp|wta}/{nom}/{année}/draws?fullBracket=true
 * en EXACTEMENT le JSON brut du bookmarklet (`ExtraitBrut`, lib/extract/types.ts),
 * pour que tout l'aval reste inchangé : parseExtract, verifierExtraction,
 * importerExtraitCoeur, scoring, simulation.
 *
 * Particularités de la source, toutes vérifiées sur de vraies réponses
 * (Wuhan WTA 2026 terminé, Bruxelles ATP 2026 en cours — fixtures) :
 *  - `roundId` est un code, pas un rang : 4 = 1er tour … 9 = quarts,
 *    10 = demies, 12 = finale (0–3 = qualifications, exclues ici). Le code
 *    interne (R64, QF…) se déduit du NOMBRE de matchs du tour ;
 *  - `draw` = emplacement du match dans son tour, à partir de 1 ;
 *  - dans un match joué, `player1` est le VAINQUEUR, pas le joueur du haut :
 *    l'ordre haut/bas se reconstitue par les matchs du tour précédent
 *    (emplacements 2k-1 et 2k alimentent l'emplacement k) ;
 *  - score en texte, du point de vue du vainqueur : « 7-6(5) 6-3 »,
 *    « 6-1 3-0 ret. », « w/o ». Le chiffre entre parenthèses = points du
 *    perdant du tie-break (rangé chez lui, comme l'extracteur ATP) ;
 *  - Q / WC / LL rangés dans le champ tête de série (« q » en minuscule) ;
 *  - places d'attente : joueur « TBA » (id générique 3700, `tbd`), exemptions :
 *    « BYE » ;
 *  - cotes décimales `odd1`/`odd2` du match, alignées sur player1/player2.
 *
 * Les identifiants de la source vivent dans leur propre espace (numériques,
 * différents des ID officiels ATP/WTA) : ils sont préfixés `ms` pour ne
 * jamais entrer en collision avec un ID WTA numérique déjà en base. Le
 * rapprochement avec les joueurs connus se fait ensuite côté base
 * (db/importApi.ts), à l'aide de `apparierNomComplet` ci-dessous.
 *
 * Aucune dépendance à Node, Next ni Supabase.
 */

import type { ExtraitBrut, JoueurBrut, MatchBrut, SetBrut } from './types';
import { normaliserNom } from '../matching';
import { cleCalendrier } from '../calendrier';
import type { Tour } from '../types';

/* -------------------------------------------------------------------------- */
/*  Formes renvoyées par l'API (champs utilisés seulement)                     */
/* -------------------------------------------------------------------------- */

export interface JoueurApi {
  id: number | null;
  name: string;
  countryAcr?: string | null;
  seed?: string | null;
  bye?: boolean;
  tbd?: boolean;
}

export interface MatchApi {
  roundId: number;
  draw: number;
  result?: string | null;
  date?: string | null;
  seed1?: string | null;
  seed2?: string | null;
  odd1?: string | number | null;
  odd2?: string | number | null;
  player1?: JoueurApi | null;
  player2?: JoueurApi | null;
  matchId?: number | string | null;
  winnerId?: number | null;
  live?: unknown;
  isBye?: boolean;
  bye?: boolean;
}

export interface TableauApi {
  singles?: MatchApi[];
}

export interface TournoiApi {
  id: number;
  name: string;
  startDate?: string | null;
  date?: string | null;
  tour?: string | null;
  rankId?: number | null;
  court?: { id: number; name: string } | null;
  countryAcr?: string | null;
}

/** Hôte RapidAPI de la source : seul hôte que le serveur interroge. */
export const HOTE_API = 'tennis-api-atp-wta-itf.p.rapidapi.com';

/** Préfixe des identifiants de la source (joueurs, matchs, tournois). */
export const PREFIXE_ID = 'ms';

/** Identifiant générique des places d'attente « TBA » / « BYE » dans la source. */
const ID_GENERIQUE = 3700;

/** roundId du tableau principal (qualifications 0–3, round robin 8, bronze 11 exclus). */
const TOURS_PRINCIPAUX = new Set([4, 5, 6, 7, 9, 10, 12]);

const CODE_PAR_TAILLE: Record<number, { code: string; libelle: string }> = {
  1: { code: 'F', libelle: 'Final' },
  2: { code: 'SF', libelle: 'Semifinals' },
  4: { code: 'QF', libelle: 'Quarterfinals' },
  8: { code: 'R16', libelle: 'Round of 16' },
  16: { code: 'R32', libelle: 'Round of 32' },
  32: { code: 'R64', libelle: 'Round of 64' },
  64: { code: 'R128', libelle: 'Round of 128' },
};

/* -------------------------------------------------------------------------- */
/*  Tournois                                                                   */
/* -------------------------------------------------------------------------- */

/** Tournoi du circuit principal (pas Challenger, pas ITF) ? `rankId` 0 = ITF, 1 = Challenger. */
export function estCircuitPrincipal(t: TournoiApi): boolean {
  return (t.rankId ?? 0) >= 2 && (t.tour === 'atp' || t.tour === 'wta');
}

/** « Japan Open - Osaka » → « japan-open-osaka ». */
export function slugifier(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Slug interne d'un tournoi de la source : la clé du référentiel
 * (lib/calendrierDonnees.ts) retrouvée par la ville (après le dernier « - »)
 * ou par le nom complet — la plus longue des deux gagne, pour que
 * « Roland Garros - Paris » donne « roland-garros » et non le Masters de
 * Paris —, sinon le slug de la ville. Un slug non reconnu est signalé par
 * l'import, comme aujourd'hui.
 */
export function slugDepuisNomApi(nom: string, tour: Tour): string {
  const morceaux = nom.split(/\s+-\s+/);
  const ville = slugifier(morceaux[morceaux.length - 1] ?? nom);
  const cles = [cleCalendrier(ville, tour), cleCalendrier(slugifier(nom), tour)].filter(
    (c): c is string => !!c,
  );
  return cles.sort((a, b) => b.length - a.length)[0] ?? ville;
}

/** URL source enregistrée pour un tableau de la source (sert aussi de clé de requête). */
export function urlTableauApi(type: 'atp' | 'wta', nom: string, annee: number): string {
  return `https://${HOTE_API}/tennis/v2/tournament/${type}/${encodeURIComponent(nom)}/${annee}/draws?fullBracket=true`;
}

/** Relit (type, nom, année) dans une URL produite par `urlTableauApi` ; null sinon. */
export function lireUrlTableauApi(url: string): { type: 'atp' | 'wta'; nom: string; annee: number } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== HOTE_API || u.username || u.password || u.port) return null;
  const m = u.pathname.match(/^\/tennis\/v2\/tournament\/(atp|wta)\/([^/]+)\/(\d{4})\/draws$/);
  if (!m) return null;
  let nom: string;
  try {
    nom = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  return { type: m[1] as 'atp' | 'wta', nom, annee: Number(m[3]) };
}

/* -------------------------------------------------------------------------- */
/*  Scores                                                                     */
/* -------------------------------------------------------------------------- */

export type IssueApi = 'completed' | 'retired' | 'walkover' | 'aucune';

export interface ScoreApi {
  /** Sets du point de vue du VAINQUEUR du match : [jeux vainqueur, jeux perdant, tie-break du perdant du set]. */
  sets: { v: number; p: number; tb: number | null }[];
  issue: IssueApi;
}

/** « 7-6(5) 6-3 » / « 6-1 3-0 ret. » / « w/o » / « » → sets et issue. */
export function lireScore(result: string | null | undefined): ScoreApi {
  const r = (result ?? '').trim().toLowerCase();
  if (!r || r === 'bye') return { sets: [], issue: 'aucune' };
  if (/\bw\s*\/\s*o\b|walkover/.test(r)) return { sets: [], issue: 'walkover' };
  const sets: ScoreApi['sets'] = [];
  for (const m of r.matchAll(/(\d+)-(\d+)(?:\((\d+)\))?/g)) {
    sets.push({ v: Number(m[1]), p: Number(m[2]), tb: m[3] === undefined ? null : Number(m[3]) });
  }
  // « ret. » (abandon) et « def. » (disqualification) : issue acquise, match incomplet.
  const issue: IssueApi = /\b(ret|def|abd|abandon)/.test(r) ? 'retired' : 'completed';
  return { sets, issue };
}

/* -------------------------------------------------------------------------- */
/*  Tableau → extrait du bookmarklet                                           */
/* -------------------------------------------------------------------------- */

/** Cote avant-match lue dans le tableau, orientée comme l'extrait (A = joueur du haut). */
export interface CoteTableau {
  eventId: string;
  playerAId: string;
  playerBId: string;
  nomA: string;
  nomB: string;
  coteA: number;
  coteB: number;
  commenceTime: string;
}

export interface ConversionTableau {
  extrait: ExtraitBrut;
  cotes: CoteTableau[];
  /** Nom complet de la source par ID préfixé (sert au rapprochement côté base). */
  nomsComplets: Record<string, string>;
}

const estAttente = (p: JoueurApi | null | undefined) =>
  !p || !p.name || p.tbd === true || /^(tba|tbd)$/i.test(p.name.trim());
const estBye = (p: JoueurApi | null | undefined) => !!p && (p.bye === true || /^bye$/i.test(p.name.trim()));

const idDe = (p: JoueurApi | null | undefined): string | null =>
  !p || estAttente(p) || estBye(p) || p.id === null || p.id === ID_GENERIQUE ? null : `${PREFIXE_ID}${p.id}`;

/** « q » → « Q », « wc » → « WC », « 3 » → « 3 », vide → null. */
function normaliserSeed(s: string | null | undefined): string | null {
  const v = String(s ?? '').trim();
  if (!v) return null;
  return /^\d+$/.test(v) ? v : v.toUpperCase();
}

function cote(v: string | number | null | undefined): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 1 ? n : null;
}

/** Vainqueur d'un match de la source, en ID préfixé (exempté compris). */
function vainqueurDe(m: MatchApi): string | null {
  const [a, b] = [m.player1, m.player2];
  if (estBye(a) && !estBye(b)) return idDe(b);
  if (estBye(b) && !estBye(a)) return idDe(a);
  if (m.winnerId != null && m.winnerId !== ID_GENERIQUE) return `${PREFIXE_ID}${m.winnerId}`;
  return null;
}

interface MatchOriente {
  m: MatchApi;
  haut: JoueurApi | null;
  bas: JoueurApi | null;
  seedHaut: string | null;
  seedBas: string | null;
  coteHaut: number | null;
  coteBas: number | null;
}

/**
 * Convertit un tableau de la source. `nom` et `annee` sont ceux de la
 * requête ; `seasonId` (calendrier) devient l'identifiant externe du tournoi.
 * Lève une erreur sur un tableau incohérent (emplacements en double ou hors
 * limites) : mieux vaut un import refusé qu'un tableau décalé.
 */
export function convertirTableauApi(
  api: TableauApi,
  p: { type: 'atp' | 'wta'; nom: string; annee: number; seasonId: number | string; startDate?: string | null },
  maintenant = new Date(),
): ConversionTableau {
  const tour: Tour = p.type === 'wta' ? 'WTA' : 'ATP';
  const principaux = (api.singles ?? []).filter((m) => TOURS_PRINCIPAUX.has(Number(m.roundId)));
  const roundIds = [...new Set(principaux.map((m) => Number(m.roundId)))].sort((a, b) => a - b);

  // Matchs par tour, rangés par emplacement (draw 1..n).
  const tours = roundIds.map((rid) => {
    const liste = principaux.filter((m) => Number(m.roundId) === rid);
    const n = liste.length;
    const code = CODE_PAR_TAILLE[n];
    if (!code) throw new Error(`Tour ${rid} de la source : ${n} matchs, taille de tableau inattendue.`);
    const parEmplacement: MatchApi[] = new Array(n);
    for (const m of liste) {
      const k = Number(m.draw) - 1;
      if (!Number.isInteger(k) || k < 0 || k >= n || parEmplacement[k]) {
        throw new Error(`Tour ${code.code} : emplacement ${m.draw} invalide ou en double.`);
      }
      parEmplacement[k] = m;
    }
    return { ...code, matchs: parEmplacement };
  });
  for (let i = 1; i < tours.length; i++) {
    if (tours[i].matchs.length * 2 !== tours[i - 1].matchs.length) {
      throw new Error(`Tours ${tours[i - 1].code} → ${tours[i].code} : nombres de matchs incohérents.`);
    }
  }

  // Orientation haut/bas : par le vainqueur des emplacements 2k (haut) et 2k+1 (bas) du tour précédent.
  const orientes: MatchOriente[][] = tours.map((t, i) =>
    t.matchs.map((m, k) => {
      let haut = m.player1 ?? null;
      let bas = m.player2 ?? null;
      let seeds: [string | null, string | null] = [m.player1?.seed ?? m.seed1 ?? null, m.player2?.seed ?? m.seed2 ?? null];
      let cotes: [number | null, number | null] = [cote(m.odd1), cote(m.odd2)];
      if (i > 0) {
        const precedent = tours[i - 1].matchs;
        const vHaut = vainqueurDe(precedent[2 * k]);
        const vBas = vainqueurDe(precedent[2 * k + 1]);
        const id1 = idDe(haut);
        const id2 = idDe(bas);
        if ((vHaut && id2 === vHaut) || (vBas && id1 === vBas)) {
          [haut, bas] = [bas, haut];
          seeds = [seeds[1], seeds[0]];
          cotes = [cotes[1], cotes[0]];
        }
      }
      return { m, haut, bas, seedHaut: normaliserSeed(seeds[0]), seedBas: normaliserSeed(seeds[1]), coteHaut: cotes[0], coteBas: cotes[1] };
    }),
  );

  const nomsComplets: Record<string, string> = {};
  const cotes: CoteTableau[] = [];
  const matches: MatchBrut[] = [];

  tours.forEach((t, i) => {
    orientes[i].forEach((o, position) => {
      const { m } = o;
      const idHaut = idDe(o.haut);
      const idBas = idDe(o.bas);
      const byeHaut = estBye(o.haut);
      const byeBas = estBye(o.bas);
      const score = lireScore(m.result);
      const vainqueur = vainqueurDe(m);
      const enCours = !!m.live && !vainqueur;

      let status: string;
      if (byeHaut || byeBas || m.isBye || m.bye || /^bye$/i.test(String(m.result ?? '').trim())) status = 'bye';
      else if (enCours) status = 'live';
      else if (score.issue === 'aucune' || !vainqueur) status = score.sets.length > 0 ? 'live' : 'scheduled';
      else status = score.issue;

      // Sets : la source les donne du point de vue du vainqueur.
      const hautGagne = vainqueur !== null && vainqueur === idHaut;
      const setsDe = (cote_: 'haut' | 'bas'): SetBrut[] => {
        if (status === 'bye' || status === 'walkover' || status === 'scheduled') return [];
        // Match en cours sans vainqueur : ordre de la source (player1 en tête).
        const estV = vainqueur === null ? (cote_ === 'haut') === (o.haut === m.player1) : (cote_ === 'haut') === hautGagne;
        return score.sets.map((s) => {
          const jeux = estV ? s.v : s.p;
          const perdantDuSet = estV ? s.v < s.p : s.p < s.v;
          return { games: jeux, tiebreak: s.tb !== null && perdantDuSet ? s.tb : null };
        });
      };

      const joueur = (pj: JoueurApi | null, id: string | null, bye: boolean, seed: string | null, cote_: 'haut' | 'bas'): JoueurBrut => {
        if (id && pj) nomsComplets[id] = pj.name.trim();
        return {
          id,
          name: bye ? 'BYE' : id && pj ? pj.name.trim() : 'TBA',
          seed: bye ? null : seed,
          country: id && pj?.countryAcr && pj.countryAcr !== 'N/A' ? pj.countryAcr.toUpperCase() : null,
          isBye: bye,
          winner: id !== null && vainqueur === id && !enCours,
          sets: setsDe(cote_),
        };
      };

      matches.push({
        match_id: m.matchId != null && m.matchId !== '' ? `${PREFIXE_ID}${m.matchId}` : null,
        round: t.code,
        round_label: t.libelle,
        position,
        half: position < t.matchs.length / 2 ? 'top' : 'bottom',
        status,
        players: [joueur(o.haut, idHaut, byeHaut, o.seedHaut, 'haut'), joueur(o.bas, idBas, byeBas, o.seedBas, 'bas')],
      });

      // Cote avant-match : deux joueurs connus, match pas joué, coup d'envoi connu.
      if (status === 'scheduled' && idHaut && idBas && o.coteHaut && o.coteBas && m.date && m.matchId != null) {
        cotes.push({
          eventId: `${PREFIXE_ID}${m.matchId}`,
          playerAId: idHaut,
          playerBId: idBas,
          nomA: o.haut!.name.trim(),
          nomB: o.bas!.name.trim(),
          coteA: o.coteHaut,
          coteB: o.coteBas,
          commenceTime: new Date(m.date).toISOString(),
        });
      }
    });
  });

  const extrait: ExtraitBrut = {
    extracted_at: maintenant.toISOString(),
    source_url: urlTableauApi(p.type, p.nom, p.annee),
    tournament: {
      slug: slugDepuisNomApi(p.nom, tour),
      atp_id: `${PREFIXE_ID}${p.seasonId}`,
      year: p.annee,
      ...(p.startDate && /^\d{4}-\d{2}-\d{2}/.test(p.startDate) ? { start_date: p.startDate.slice(0, 10) } : {}),
    },
    tour,
    rounds_found: tours.map((t) => t.code),
    match_count: matches.length,
    matches,
  };
  return { extrait, cotes, nomsComplets };
}

/** Probabilité sans marge de A, à partir de deux cotes décimales (normalisation au prorata). */
export function probaSansMarge(coteA: number, coteB: number): number {
  const a = 1 / coteA;
  const b = 1 / coteB;
  return a / (a + b);
}

/* -------------------------------------------------------------------------- */
/*  Noms : rapprochement avec les joueurs déjà en base                         */
/* -------------------------------------------------------------------------- */

/** Nom d'affichage au format des sites officiels : « Clement Chidekh » → « C. Chidekh ». */
export function nomAffichage(complet: string): string {
  const t = complet.trim().split(/\s+/).filter(Boolean);
  if (t.length < 2) return complet.trim();
  return `${t[0][0].toUpperCase()}. ${t.slice(1).join(' ')}`;
}

/**
 * Formes courtes plausibles d'un nom complet, au format « X. Nom ».
 *
 * La source donne l'état civil complet (« Maria Camila Osorio Serrano »,
 * « Jaume Antoni Munar Clar ») là où la base garde le nom d'usage des sites
 * officiels (« C. Osorio », « J. Munar »). On génère donc : l'initiale de
 * chaque prénom possible suivie de chaque suite de mots qui la suit.
 */
export function variantesNom(complet: string): string[] {
  const t = complet.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  const out = new Set<string>([complet.trim()]);
  for (let i = 0; i < t.length - 1; i++) {
    for (let j = i + 1; j < t.length; j++) {
      for (let k = j; k < t.length; k++) out.add(`${t[i][0]}. ${t.slice(j, k + 1).join(' ')}`);
    }
  }
  return [...out];
}

export type Appariement =
  | { statut: 'trouve'; id: string }
  | { statut: 'ambigu'; candidats: string[] }
  | { statut: 'absent' };

/**
 * Retrouve un joueur déjà en base (même circuit) à partir du nom complet de
 * la source. Le nom exact prime ; sinon on accepte une forme courte SEULEMENT
 * si toutes les formes trouvées désignent le même joueur (« X. Wang » vise
 * deux joueuses : ambigu, rien n'est fusionné), et si le pays ne contredit
 * pas (quand les deux côtés le donnent).
 */
export function apparierNomComplet(
  existants: { id: string; name: string; country?: string | null }[],
  complet: string,
  pays?: string | null,
): Appariement {
  const index = new Map<string, { id: string; country?: string | null }[]>();
  for (const e of existants) {
    const cle = normaliserNom(e.name);
    if (!cle) continue;
    (index.get(cle) ?? index.set(cle, []).get(cle)!).push(e);
  }
  const paysCompatible = (e: { country?: string | null }) =>
    !pays || !e.country || e.country.toUpperCase() === pays.toUpperCase();

  const exacts = (index.get(normaliserNom(complet)) ?? []).filter(paysCompatible);
  if (exacts.length === 1) return { statut: 'trouve', id: exacts[0].id };

  const ids = new Set<string>();
  for (const v of variantesNom(complet)) {
    for (const e of index.get(normaliserNom(v)) ?? []) if (paysCompatible(e)) ids.add(e.id);
  }
  if (ids.size === 1) return { statut: 'trouve', id: [...ids][0] };
  if (ids.size > 1) {
    const noms = existants.filter((e) => ids.has(e.id)).map((e) => `${e.name} (${e.id})`);
    return { statut: 'ambigu', candidats: noms };
  }
  return { statut: 'absent' };
}

/* -------------------------------------------------------------------------- */
/*  Identifiants de la source → joueurs en base                                */
/* -------------------------------------------------------------------------- */

export interface Reidentification {
  extrait: ExtraitBrut;
  cotes: CoteTableau[];
  avertissements: string[];
  /** ID de la source (sans préfixe) → ID retenu, à mémoriser après l'import. */
  correspondances: { sourceId: string; playerId: string; nomSource: string }[];
}

/**
 * Remplace les identifiants de la source par ceux des joueurs déjà en base.
 * Ordre de priorité : correspondance mémorisée (`memoire`, ID sans préfixe →
 * ID en base), rapprochement par nom (`apparierNomComplet`), sinon nouveau
 * joueur (ID préfixé conservé, nom au format « X. Nom »).
 *
 * Un joueur retrouvé garde le NOM et le pays de la base : c'est sur ce nom
 * que se fait le rapprochement avec les Elo Tennis Abstract.
 *
 * `ordreEnBase` (« R32#0 » → [joueur 1, joueur 2] en base) garde l'ordre
 * haut/bas déjà enregistré : un 1er tour joué arrive « vainqueur en tête »
 * dans la source, il ne doit pas permuter à chaque import.
 */
export function reidentifier(
  conv: ConversionTableau,
  existants: { id: string; name: string; country?: string | null }[],
  memoire: Map<string, string>,
  ordreEnBase: Map<string, [string | null, string | null]> = new Map(),
): Reidentification {
  const parId = new Map(existants.map((j) => [j.id, j]));
  const pays = new Map<string, string | null>();
  for (const m of conv.extrait.matches) for (const p of m.players) if (p.id) pays.set(p.id, p.country);

  const remap = new Map<string, { id: string; name: string; country: string | null }>();
  const avertissements: string[] = [];
  const rapproches: string[] = [];
  const nouveaux: string[] = [];
  const correspondances: Reidentification['correspondances'] = [];

  for (const [idSource, complet] of Object.entries(conv.nomsComplets)) {
    const sourceId = idSource.slice(PREFIXE_ID.length);
    const paysSource = pays.get(idSource) ?? null;
    let retenu: string | null = memoire.get(sourceId) ?? null;
    if (retenu && !parId.has(retenu)) retenu = null;
    if (!retenu) {
      const a = apparierNomComplet(existants, complet, paysSource);
      if (a.statut === 'trouve') {
        retenu = a.id;
        rapproches.push(complet === parId.get(a.id)?.name ? complet : `${complet} → ${parId.get(a.id)?.name}`);
      } else if (a.statut === 'ambigu') {
        avertissements.push(
          `« ${complet} » : nom ambigu (${a.candidats.join(', ')}) — gardé comme nouveau joueur ${idSource}, PAS fusionné. ` +
            'Si l’import est refusé pour doublon, déclarer la correspondance dans tn_player_source_ids.',
        );
      } else {
        nouveaux.push(nomAffichage(complet));
      }
    }
    const e = retenu ? parId.get(retenu) : undefined;
    const r = e
      ? { id: e.id, name: e.name, country: e.country ?? paysSource }
      : { id: idSource, name: nomAffichage(complet), country: paysSource };
    remap.set(idSource, r);
    correspondances.push({ sourceId, playerId: r.id, nomSource: complet });
  }
  if (rapproches.length) {
    avertissements.push(`${rapproches.length} joueur(s) retrouvé(s) en base par le nom (une seule fois, mémorisé ensuite) : ${rapproches.join(', ')}.`);
  }
  if (nouveaux.length) avertissements.push(`${nouveaux.length} nouveau(x) joueur(s) : ${nouveaux.join(', ')}.`);

  const matches = conv.extrait.matches.map((m) => {
    const players = m.players.map((pl) => {
      const r = pl.id ? remap.get(pl.id) : undefined;
      return r ? { ...pl, id: r.id, name: r.name, country: r.country } : pl;
    }) as MatchBrut['players'];
    const avant = ordreEnBase.get(`${m.round}#${m.position}`);
    // Une exemption est stockée sans joueur (null) : elle compte dans la comparaison.
    const [a, b] = players.map((p) => (p.isBye ? null : p.id));
    if (avant && a !== b && (avant[0] ?? null) === b && (avant[1] ?? null) === a) {
      return { ...m, players: [players[1], players[0]] as MatchBrut['players'] };
    }
    return { ...m, players };
  });

  const idFinal = (id: string) => remap.get(id)?.id ?? id;
  return {
    extrait: { ...conv.extrait, matches },
    cotes: conv.cotes.map((c) => ({ ...c, playerAId: idFinal(c.playerAId), playerBId: idFinal(c.playerBId) })),
    avertissements,
    correspondances,
  };
}
