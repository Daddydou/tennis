/**
 * ELO MAISON — chargement de l'historique des matchs (ATP + WTA, tous niveaux).
 *
 * Sources :
 *  - archive Jeff Sackmann (CC BY-NC-SA 4.0), 1990 → début juin 2026, téléchargée par
 *    telecharger.mjs dans _donnees/sackmann ;
 *  - API tennis (Matchstat), début juin 2026 → hier, pages en cache dans _donnees/api
 *    (combler-api.mjs). Les doublons avec l'archive (2e semaine de Roland-Garros) sont
 *    écartés, et les joueurs de l'API sont rattachés à ceux de l'archive par le nom.
 *
 * Sortie : un tableau de matchs triés par date, compact, prêt pour le moteur (modele.mts).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const RACINE = 'C:\\Users\\lolor\\Projets\\_donnees';

import { lireScoreTexte, type NiveauElo, type SurfaceElo } from '../../lib/eloMaison.ts';

/** Niveau du match, pour le facteur K et le choix des matchs évalués (cf. lib/eloMaison.ts). */
export type Niveau = NiveauElo;
export type Surface = SurfaceElo;
export { lireScoreTexte };

export interface MatchHisto {
  tour: 'ATP' | 'WTA';
  /** Jours depuis le 1970-01-01 (avec un décalage par tour pour l'ordre au sein d'un tournoi). */
  jour: number;
  date: string;
  niveau: Niveau;
  surface: Surface;
  bestOf: 3 | 5;
  gagnant: string;
  perdant: string;
  /** Jeux gagnés par le vainqueur / le perdant (tie-breaks comptés comme un jeu). */
  jeuxG: number;
  jeuxP: number;
  abandon: boolean;
  tournoi: string;
  tour_: string;
  rangG: number | null;
  rangP: number | null;
  source: 'sackmann' | 'api';
}

/* ----------------------------------------------------------------------------------- */

function lireCsv(fichier: string): string[][] {
  const texte = readFileSync(fichier, 'utf8');
  const lignes: string[][] = [];
  for (const l of texte.split(/\r?\n/)) {
    if (!l) continue;
    if (!l.includes('"')) {
      lignes.push(l.split(','));
      continue;
    }
    const c: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) {
        c.push(cur);
        cur = '';
      } else cur += ch;
    }
    c.push(cur);
    lignes.push(c);
  }
  return lignes;
}

const ORDRE_TOURS: Record<string, number> = {
  Q1: 0, Q2: 1, Q3: 2, Q4: 3, ER: 3, R128: 4, R64: 5, R32: 6, R16: 7, RR: 7, QF: 8, SF: 9, BR: 9, F: 10,
};

const jourDe = (aaaammjj: string) =>
  Math.floor(Date.UTC(+aaaammjj.slice(0, 4), +aaaammjj.slice(4, 6) - 1, +aaaammjj.slice(6, 8)) / 86400000);

function niveauSackmann(tour: 'ATP' | 'WTA', lvl: string, round: string, fichier: string): Niveau | null {
  const qualif = round.startsWith('Q');
  if (lvl === 'D') return 'D';
  if (tour === 'ATP') {
    if (lvl === 'G') return qualif ? 'Q' : 'G';
    if (lvl === 'M') return qualif ? 'Q' : 'M';
    if (lvl === 'A' || lvl === 'O') return qualif ? 'Q' : 'A';
    if (lvl === 'F') return 'F';
    if (lvl === 'C') return 'C';
    if (/^\d+$/.test(lvl) || lvl === 'S') return 'S';
    return null;
  }
  // WTA : G, PM (Premier mandatory / 1000), P (Premier / 500), I (International / 250), F (Finals),
  // C (WTA 125), ITF : 10 → 100 (K). Qualifications du circuit dans le fichier qual_itf.
  if (lvl === 'G') return qualif ? 'Q' : 'G';
  if (lvl === 'PM' || lvl === 'T1') return qualif ? 'Q' : 'M';
  if (lvl === 'P' || lvl === 'I' || lvl === 'T2' || lvl === 'T3' || lvl === 'T4' || lvl === 'T5' || lvl === 'W') return qualif ? 'Q' : 'A';
  if (lvl === 'F' || lvl === 'O') return 'F';
  if (lvl === 'C') return 'C';
  if (/^\d+$/.test(lvl)) return +lvl >= 60 ? 'C' : 'S';
  void fichier;
  return null;
}

const SURFACES: Record<string, Surface> = { Hard: 'hard', Clay: 'clay', Grass: 'grass', Carpet: 'carpet' };

/** Normalisation d'un nom complet pour rattacher l'API à l'archive. */
export function cleNom(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Jetons d'un nom pour le rattachement API <-> archive : sans accents, apostrophes et traits
 * d'union COLLES (« O'Connell » = « Oconnell »), le point d'une initiale est un separateur.
 */
export function jetonsNom(nom: string): string[] {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`-]/g, '')
    .replace(/\./g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Codes pays qui different entre l'archive (IOC) et l'API pour un meme pays. */
const ALIAS_PAYS: Record<string, string> = { LBN: 'LIB', TWN: 'TPE', DEU: 'GER', NED: 'NED', HOL: 'NED' };
export const normPays = (p: string | null | undefined): string => (p ? (ALIAS_PAYS[p] ?? p) : '');

/**
 * Troisieme regle de rattachement (apres le nom complet et « meme prenom + meme pays ») :
 * meme pays, meme INITIALE de prenom, et au moins un mot de nom de famille (4 lettres ou plus)
 * en commun. Couvre « Cori Gauff » / « Coco Gauff », « Jeff Wolf » / « J J Wolf »,
 * « Diego Dedura » / « Diego Dedura Palomero ». Retourne vrai si les deux noms se ressemblent
 * assez pour etre CANDIDATS ; l'appelant n'accepte que s'il n'y a qu'un seul candidat.
 */
export function memeFamille(nomApi: string, nomArchive: string): boolean {
  const a = jetonsNom(nomApi);
  const b = jetonsNom(nomArchive);
  if (a.length < 2 || b.length < 2 || a[0][0] !== b[0][0]) return false;
  const reste = new Set(b.slice(1));
  return a.slice(1).some((t) => t.length >= 4 && reste.has(t));
}

export interface Joueur {
  cle: string;
  nom: string;
  pays: string | null;
  naissance: string | null;
}

export interface Historique {
  matchs: MatchHisto[];
  joueurs: Map<string, Joueur>;
  /** Joueur de l'API (« ATP:m27482 ») → clé de l'archive (« ATP:s126203 »). */
  liensApi: Map<string, string>;
  stats: Record<string, number>;
}

export function chargerHistorique(opts: { debut?: number; avecApi?: boolean } = {}): Historique {
  const debut = opts.debut ?? 1990;
  const matchs: MatchHisto[] = [];
  const joueurs = new Map<string, Joueur>();
  const stats: Record<string, number> = {};
  const compter = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);

  for (const tour of ['ATP', 'WTA'] as const) {
    const t = tour.toLowerCase();
    const dir = join(RACINE, 'sackmann', t);
    for (const l of lireCsv(join(dir, `${t}_players.csv`)).slice(1)) {
      const cle = `${tour}:s${l[0]}`;
      joueurs.set(cle, { cle, nom: `${l[1]} ${l[2]}`.trim(), pays: l[5] || null, naissance: l[4] || null });
    }
    for (const f of readdirSync(dir).filter((x) => /_matches(_qual_chall|_futures|_qual_itf)?_\d{4}\.csv$/.test(x))) {
      const annee = +f.match(/(\d{4})\.csv$/)![1];
      if (annee < debut) continue;
      const lignes = lireCsv(join(dir, f));
      const h = lignes[0];
      const ix = (n: string) => h.indexOf(n);
      const I = {
        id: ix('tourney_id'), nom: ix('tourney_name'), surf: ix('surface'), lvl: ix('tourney_level'), date: ix('tourney_date'),
        w: ix('winner_id'), l: ix('loser_id'), score: ix('score'), bo: ix('best_of'), round: ix('round'),
        wr: ix('winner_rank'), lr: ix('loser_rank'),
      };
      for (const c of lignes.slice(1)) {
        const round = c[I.round] ?? '';
        const niveau = niveauSackmann(tour, c[I.lvl], round, f);
        if (!niveau) {
          compter('niveau inconnu');
          continue;
        }
        const sc = lireScoreTexte(c[I.score]);
        if (sc.forfait) {
          compter('forfait écarté');
          continue;
        }
        const surface = SURFACES[c[I.surf]] ?? 'hard';
        const date = c[I.date];
        if (!/^\d{8}$/.test(date)) continue;
        matchs.push({
          tour,
          jour: jourDe(date) + (ORDRE_TOURS[round] ?? 5) * (niveau === 'G' ? 1.3 : 0.7) / 10,
          date,
          niveau,
          surface,
          bestOf: c[I.bo] === '5' ? 5 : 3,
          gagnant: `${tour}:s${c[I.w]}`,
          perdant: `${tour}:s${c[I.l]}`,
          jeuxG: sc.jeuxG,
          jeuxP: sc.jeuxP,
          abandon: sc.abandon,
          tournoi: c[I.nom],
          tour_: round,
          rangG: c[I.wr] ? +c[I.wr] : null,
          rangP: c[I.lr] ? +c[I.lr] : null,
          source: 'sackmann',
        });
        compter(`sackmann ${tour}`);
      }
    }
  }

  const liensApi = new Map<string, string>();
  if (opts.avecApi !== false) ajouterApi(matchs, joueurs, liensApi, compter);

  matchs.sort((a, b) => a.jour - b.jour);
  return { matchs, joueurs, liensApi, stats };
}

/* ----------------------------------------------------------------------------------- */
/*  Complément API                                                                      */
/* ----------------------------------------------------------------------------------- */

const SURFACE_API: Record<number, Surface> = { 1: 'hard', 2: 'clay', 3: 'hard', 4: 'carpet', 5: 'grass' };

function ajouterApi(
  matchs: MatchHisto[],
  joueurs: Map<string, Joueur>,
  liens: Map<string, string>,
  compter: (k: string) => void,
) {
  const dir = join(RACINE, 'api');
  if (!existsSync(dir)) return;

  // Index des joueurs de l'archive actifs depuis 2024 : nom normalisé (+ pays).
  const actifs = new Set<string>();
  for (const m of matchs) if (m.date >= '20240101') {
    actifs.add(m.gagnant);
    actifs.add(m.perdant);
  }
  const parNom = new Map<string, Joueur[]>();
  for (const k of actifs) {
    const j = joueurs.get(k);
    if (!j) continue;
    const cle = `${k.slice(0, 3)}|${cleNom(j.nom)}`;
    (parNom.get(cle) ?? parNom.set(cle, []).get(cle)!).push(j);
  }
  const parPrenomPays = new Map<string, Joueur[]>();
  for (const k of actifs) {
    const j = joueurs.get(k);
    if (!j) continue;
    const t = cleNom(j.nom).split(' ');
    const cle = `${k.slice(0, 3)}|${t[0]}|${normPays(j.pays)}`;
    (parPrenomPays.get(cle) ?? parPrenomPays.set(cle, []).get(cle)!).push(j);
  }
  // Pays + initiale du prenom : candidats de la regle « meme famille ».
  const parInitialePays = new Map<string, Joueur[]>();
  for (const k of actifs) {
    const j = joueurs.get(k);
    const t = j ? jetonsNom(j.nom) : [];
    if (!j || !j.pays || t.length < 2) continue;
    const cle = `${k.slice(0, 3)}|${t[0][0]}|${normPays(j.pays)}`;
    (parInitialePays.get(cle) ?? parInitialePays.set(cle, []).get(cle)!).push(j);
  }
  // Joueur de l'archive deja rattache a un identifiant API : la regle « meme famille » ne le reprend pas.
  const reclames = new Map<string, string>();

  const rattacher = (tour: 'ATP' | 'WTA', id: number, nom: string, pays: string | null): string => {
    const cleApi = `${tour}:m${id}`;
    if (liens.has(cleApi)) return liens.get(cleApi)!;
    let cible: string | null = null;
    const exacts = (parNom.get(`${tour}|${cleNom(nom)}`) ?? []).filter((j) => !pays || !j.pays || normPays(j.pays) === normPays(pays));
    if (exacts.length === 1) cible = exacts[0].cle;
    if (!cible && pays) {
      // Changement de nationalite (Potapova RUS -> AUT, Blinkova RUS -> FRA, Topo GER -> SRB...) :
      // un seul joueur actif de l'archive porte exactement ce nom, et personne d'autre ne l'a repris.
      const memeNom = (parNom.get(`${tour}|${cleNom(nom)}`) ?? []).filter((j) => !reclames.has(j.cle));
      if (memeNom.length === 1) {
        cible = memeNom[0].cle;
        compter(`api lien nationalite ${tour}`);
      }
    }
    if (!cible && pays) {
      // « Jaume Antoni Munar Clar » ↔ « Jaume Munar » : même prénom, même pays, tous les mots du
      // nom de l'archive présents dans celui de l'API.
      const t = cleNom(nom).split(' ');
      const cands = (parPrenomPays.get(`${tour}|${t[0]}|${normPays(pays)}`) ?? []).filter((j) =>
        cleNom(j.nom).split(' ').slice(1).every((mot) => t.includes(mot)),
      );
      if (cands.length === 1) cible = cands[0].cle;
    }
    if (!cible && pays) {
      // Meme famille (cf. memeFamille) : un seul candidat libre, sinon on ne rattache pas.
      const ti = jetonsNom(nom);
      const cands = (ti.length >= 2 ? (parInitialePays.get(`${tour}|${ti[0][0]}|${normPays(pays)}`) ?? []) : []).filter(
        (j) => memeFamille(nom, j.nom) && !reclames.has(j.cle),
      );
      if (cands.length === 1) {
        cible = cands[0].cle;
        compter(`api lien famille ${tour}`);
      }
    }
    if (cible) reclames.set(cible, cleApi);
    if (cible) compter(`api lien ${tour}`);
    else {
      compter(`api nouveau ${tour}`);
      joueurs.set(cleApi, { cle: cleApi, nom, pays, naissance: null });
    }
    liens.set(cleApi, cible ?? cleApi);
    return cible ?? cleApi;
  };

  // Doublons : même paire de joueurs à ±14 jours dans l'archive.
  const vus = new Map<string, number[]>();
  for (const m of matchs) {
    const k = [m.gagnant, m.perdant].sort().join('|');
    (vus.get(k) ?? vus.set(k, []).get(k)!).push(m.jour);
  }

  const dejaApi = new Set<string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const tour = f.startsWith('wta') ? 'WTA' : 'ATP';
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const m of j.data ?? []) {
      if (dejaApi.has(String(m.id))) continue;
      dejaApi.add(String(m.id));
      if (m.result_type === 'walkover' || !m.match_winner) {
        compter('api forfait écarté');
        continue;
      }
      const p1 = m.player1;
      const p2 = m.player2;
      if (!p1?.id || !p2?.id || /\//.test(`${p1.name}${p2.name}`)) {
        compter('api double ou incomplet');
        continue;
      }
      const g = m.match_winner === p1.id ? p1 : p2;
      const p = g === p1 ? p2 : p1;
      const sc = lireScoreTexte(String(m.result ?? ''));
      if (sc.forfait) continue;
      const rank = m.tournament?.rankId ?? 2;
      const qualif = Number(m.roundId) <= 3;
      let niveau: Niveau = qualif ? (rank >= 2 ? 'Q' : 'C') : rank === 4 ? 'G' : rank === 3 ? 'M' : rank === 2 ? 'A' : 'C';
      // Même découpage que l'archive : ITF féminin < 60 K = niveau S (W15 … W50).
      const itf = String(m.tournament?.name ?? '').match(/^W(\d+)\b/);
      if (rank <= 1 && itf && +itf[1] < 60) niveau = 'S';
      const date = String(m.date ?? m.tournament?.date ?? '').slice(0, 10).replace(/-/g, '');
      if (!/^\d{8}$/.test(date)) continue;
      const kg = rattacher(tour, g.id, g.name, g.countryAcr ?? null);
      const kp = rattacher(tour, p.id, p.name, p.countryAcr ?? null);
      const jour = jourDe(date);
      const paire = [kg, kp].sort().join('|');
      if ((vus.get(paire) ?? []).some((d) => Math.abs(d - jour) <= 14)) {
        compter('api doublon archive');
        continue;
      }
      matchs.push({
        tour,
        jour: jour + 0.5,
        date,
        niveau,
        surface: SURFACE_API[m.tournament?.courtId] ?? 'hard',
        // L'API ne donne pas toujours best_of : 5 sets en Grand Chelem masculin seulement.
        bestOf: m.best_of === 5 || (tour === 'ATP' && niveau === 'G') ? 5 : 3,
        gagnant: kg,
        perdant: kp,
        jeuxG: sc.jeuxG,
        jeuxP: sc.jeuxP,
        abandon: m.result_type === 'retired' || sc.abandon,
        tournoi: m.tournament?.name ?? '',
        tour_: qualif ? `Q${m.roundId}` : `r${m.roundId}`,
        rangG: null,
        rangP: null,
        source: 'api',
      });
      compter(`api ${tour}`);
    }
  }
}
