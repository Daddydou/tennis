/**
 * USERSCRIPT TAMPERMONKEY — import automatique des tableaux ATP (et WTA en repli).
 *
 * Source TypeScript : empaquetée par esbuild (npm run build:userscript) dans
 * tools/userscript/import-auto.user.js, AVEC les extracteurs partagés de
 * lib/extract/ — exactement les mêmes fonctions que le serveur et les tests de
 * parité, pas une copie.
 *
 * Toutes les 30 min sur un onglet atptour.com / wtatennis.com ouvert :
 *   1. GET /api/import-auto/etat ;
 *   2. pour chaque tournoi dû de ce site (ATP, ou WTA en mode « navigateur ») :
 *      DOM vivant si on est sur sa page draws, sinon fetch même origine
 *      (cookies Cloudflare du navigateur) + DOMParser ;
 *   3. extraction + contrôle (parseExtract/verifierExtraction) ; si OK,
 *      POST /ingest. Jamais d'import du vide ;
 *   4. si le HTML brut ne contient pas le tableau (injecté par JavaScript),
 *      ouverture de la page draws dans un ONGLET D'ARRIÈRE-PLAN (au plus une
 *      fois par heure et par tournoi) : le script, qui y tourne aussi, lit le
 *      DOM vivant, envoie à /ingest (ou journalise l'échec) puis ferme
 *      l'onglet — au plus tard après 60 s. Sinon, échec signalé au serveur.
 *
 * Le jeton IMPORT_AUTO_TOKEN est demandé une fois et rangé dans le stockage
 * de Tampermonkey (GM_setValue) — jamais dans ce fichier.
 */

import { circuitDeUrl, controlerExtrait, extraireDepuisDocument } from '../../../lib/extract';

declare function GM_getValue<T>(cle: string, defaut: T): T;
declare function GM_setValue(cle: string, valeur: unknown): void;
declare function GM_xmlhttpRequest(details: {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  data?: string;
  timeout?: number;
  anonymous?: boolean;
  onload: (r: { status: number; responseText: string }) => void;
  onerror: () => void;
  ontimeout: () => void;
}): void;
declare function GM_openInTab(
  url: string,
  options: { active: boolean; insert: boolean },
): { close?: () => void } | undefined;

const BASE = 'https://tennis-nine-zeta.vercel.app';
const CLE_JETON = 'importAuto.jeton';
const CLE_REFUS = 'importAuto.jetonRefuseLe';
const CLE_REFUS_CONSECUTIFS = 'importAuto.refusConsecutifs';
const REFUS_AVANT_OUBLI = 3;
const CLE_VERROU = 'importAuto.verrou';
const CLE_DERNIER = 'importAuto.dernier';
const INTERVALLE_MS = 30 * 60 * 1000;
const VERROU_MS = 10 * 60 * 1000;
const UNE_JOURNEE = 24 * 60 * 60 * 1000;

// Onglet d'arrière-plan (voie de repli quand le HTML brut n'a pas le tableau).
const CLE_ONGLET_DE_FOND = 'importAuto.ongletDeFond';
const CLE_ONGLET_OUVERT = 'importAuto.ongletOuvertLe.'; // + tournament_id
const CLE_ECHEC_FETCH = 'importAuto.echecFetchLe.'; // + tournament_id
const ONGLET_PAR_TOURNOI_MS = 60 * 60 * 1000; // au plus une ouverture par heure
const ECHEC_FETCH_MIN_MS = 30 * 60 * 1000; // dernier échec fetch > 30 min
const FERMETURE_SECURITE_MS = 60 * 1000;
const MARQUE_VALIDE_MS = 5 * 60 * 1000;
const ATTENTE_TABLEAU_MS = 20 * 1000;
const ANCRE = 'tennis-import-auto=';

interface TournoiEtat {
  tournament_id: string;
  tour: 'ATP' | 'WTA';
  source_url: string;
  mode: 'serveur' | 'navigateur';
  du: boolean;
}

interface Dernier {
  ok: boolean;
  quand: number;
  texte: string;
  /** Résultat pas encore connu (onglet d'arrière-plan en cours). */
  enCours?: boolean;
}

interface Marque {
  nonce: string;
  tournament_id: string;
  quand: number;
}

/* ------------------------------- Jeton ---------------------------------- */

function jeton(): string | null {
  const j = GM_getValue<string>(CLE_JETON, '');
  if (j) return j;
  // Une seule demande par jour si l'utilisateur a annulé.
  if (Date.now() - GM_getValue<number>(CLE_REFUS, 0) < UNE_JOURNEE) return null;
  const saisi = (window.prompt(
    'Import auto tennis : colle le jeton IMPORT_AUTO_TOKEN.\n' +
      'Il est rangé dans Tampermonkey (pas dans le fichier du script).',
  ) ?? '').trim();
  if (saisi.length < 32) {
    GM_setValue(CLE_REFUS, Date.now());
    return null;
  }
  GM_setValue(CLE_JETON, saisi);
  return saisi;
}

/* ------------------------------ Réseau ---------------------------------- */

function appeler(methode: 'GET' | 'POST', chemin: string, j: string, corps?: unknown) {
  return new Promise<{ status: number; json: Record<string, unknown> | null }>((resolve, reject) => {
    GM_xmlhttpRequest({
      method: methode,
      url: `${BASE}${chemin}`,
      headers: { 'x-import-token': j, 'Content-Type': 'application/json' },
      data: corps === undefined ? undefined : JSON.stringify(corps),
      timeout: 180_000,
      // Sans les cookies de l'app : seul le jeton doit ouvrir l'accès, jamais
      // la session de l'utilisateur connecté.
      anonymous: true,
      onload: (r) => {
        let json: Record<string, unknown> | null = null;
        try {
          json = JSON.parse(r.responseText);
        } catch {
          /* corps non JSON */
        }
        resolve({ status: r.status, json });
      },
      onerror: () => reject(new Error('réseau')),
      ontimeout: () => reject(new Error('délai dépassé')),
    });
  });
}

/* ------------------------------- Badge ---------------------------------- */

function afficherBadge(d: Dernier | null) {
  let el = document.getElementById('tennis-import-auto-badge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tennis-import-auto-badge';
    // Discret, au-dessus de la page mais transparent aux clics.
    el.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:2147483647;pointer-events:none;' +
      'font:11px/1.3 system-ui,sans-serif;padding:3px 7px;border-radius:6px;opacity:.85;' +
      'color:#fff;max-width:60vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    document.body.appendChild(el);
  }
  if (!d) {
    el.style.background = '#52525b';
    el.textContent = 'Import auto : en attente';
    return;
  }
  const heure = new Date(d.quand).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  el.style.background = d.enCours ? '#52525b' : d.ok ? '#15803d' : '#b91c1c';
  el.textContent = `Import auto ${d.enCours ? 'EN COURS' : d.ok ? 'OK' : 'ERREUR'} · ${heure} · ${d.texte}`;
}

function noter(ok: boolean, texte: string, enCours = false) {
  const d: Dernier = { ok, quand: Date.now(), texte, ...(enCours ? { enCours } : {}) };
  GM_setValue(CLE_DERNIER, d);
  afficherBadge(d);
}

/* ------------------------------ Verrou ---------------------------------- */

/** Verrou entre onglets : un seul cycle à la fois (horodatage + identifiant). */
async function prendreVerrou(): Promise<string | null> {
  const actuel = GM_getValue<{ id: string; quand: number } | null>(CLE_VERROU, null);
  if (actuel && Date.now() - actuel.quand < VERROU_MS) return null;
  const id = Math.random().toString(36).slice(2);
  GM_setValue(CLE_VERROU, { id, quand: Date.now() });
  // Un autre onglet a pu écrire en même temps : on relit après un court délai.
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
  return GM_getValue<{ id: string } | null>(CLE_VERROU, null)?.id === id ? id : null;
}

function rendreVerrou(id: string) {
  if (GM_getValue<{ id: string } | null>(CLE_VERROU, null)?.id === id) GM_setValue(CLE_VERROU, null);
}

/* ------------------------------ Extraction ------------------------------ */

const sansSlashFinal = (s: string) => s.replace(/\/+$/, '');

function surCettePage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === location.origin && sansSlashFinal(u.pathname) === sansSlashFinal(location.pathname);
  } catch {
    return false;
  }
}

const sansAncre = (url: string) => url.split('#')[0];

function signalerEchec(t: TournoiEtat, j: string, erreur: string) {
  return appeler('POST', '/api/import-auto/ingest', j, { tournament_id: t.tournament_id, echec: erreur });
}

/** Contrôle puis envoi d'une extraction ; un contrôle raté est journalisé côté serveur. */
async function envoyer(t: TournoiEtat, j: string, extrait: ReturnType<typeof extraireDepuisDocument>): Promise<string> {
  const controle = controlerExtrait(extrait);
  if (!controle.ok) {
    await signalerEchec(t, j, controle.erreur);
    throw new Error(controle.erreur);
  }
  const r = await appeler('POST', '/api/import-auto/ingest', j, { tournament_id: t.tournament_id, json: extrait });
  if (r.status !== 200) throw new Error(String(r.json?.detail ?? r.json?.error ?? `HTTP ${r.status}`));
  return r.json?.statut === 'inchange' ? 'inchangé' : `${r.json?.matchs_changes ?? '?'} matchs changés`;
}

/**
 * Ouvre la page draws en arrière-plan si les garde-fous le permettent :
 * dernier échec « fetch » de ce tournoi > 30 min, et au plus une ouverture
 * par heure et par tournoi. L'onglet est reconnu par un jeton à usage unique
 * dans l'ancre (#tennis-import-auto=…) : une page draws ouverte à la main
 * n'est jamais prise pour lui, ni fermée.
 */
function ouvrirOngletDraws(t: TournoiEtat): boolean {
  const maintenant = Date.now();
  const cleEchec = CLE_ECHEC_FETCH + t.tournament_id;
  const echecPrecedent = GM_getValue<number>(cleEchec, 0);
  GM_setValue(cleEchec, maintenant);
  if (maintenant - echecPrecedent < ECHEC_FETCH_MIN_MS) return false;

  const cleOnglet = CLE_ONGLET_OUVERT + t.tournament_id;
  if (maintenant - GM_getValue<number>(cleOnglet, 0) < ONGLET_PAR_TOURNOI_MS) return false;
  if (typeof GM_openInTab !== 'function') return false;

  const marque: Marque = { nonce: Math.random().toString(36).slice(2), tournament_id: t.tournament_id, quand: maintenant };
  GM_setValue(CLE_ONGLET_DE_FOND, marque);
  GM_setValue(cleOnglet, maintenant);
  const onglet = GM_openInTab(`${sansAncre(t.source_url)}#${ANCRE}${marque.nonce}`, { active: false, insert: false });
  // Ceinture et bretelles : l'onglet se ferme lui-même, sinon on le ferme d'ici.
  setTimeout(() => {
    try {
      onglet?.close?.();
    } catch {
      /* déjà fermé */
    }
  }, FERMETURE_SECURITE_MS + 15_000);
  return true;
}

async function traiter(t: TournoiEtat, j: string): Promise<{ texte: string; enCours?: boolean }> {
  // Sur la page draws elle-même : DOM vivant.
  if (surCettePage(t.source_url)) return { texte: await envoyer(t, j, extraireDepuisDocument(document, t.source_url)) };

  // 1re tentative : HTML brut de la page draws (fetch même origine).
  let extrait: ReturnType<typeof extraireDepuisDocument> = null;
  let erreur: string | null = null;
  try {
    const res = await fetch(t.source_url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur la page draws`);
    extrait = extraireDepuisDocument(new DOMParser().parseFromString(await res.text(), 'text/html'), t.source_url);
  } catch (e) {
    erreur = (e as Error).message;
  }
  const controle = controlerExtrait(extrait);
  if (controle.ok) return { texte: await envoyer(t, j, extrait) };
  const motif = erreur ?? controle.erreur;

  // 2e tentative : la page draws dans un onglet d'arrière-plan. L'échec n'est
  // PAS signalé ici : le serveur mettrait le tournoi en pause une heure et
  // l'onglet le trouverait « pas dû ». C'est l'onglet qui envoie le résultat
  // ou journalise l'échec.
  if (ouvrirOngletDraws(t)) return { texte: `HTML brut sans tableau, page draws ouverte en arrière-plan`, enCours: true };

  await signalerEchec(t, j, motif);
  throw new Error(motif);
}

/* ------------------------- Onglet d'arrière-plan ------------------------- */

/** Cet onglet a-t-il été ouvert par le script ? (ancre + marque, usage unique) */
function marqueOngletDeFond(): Marque | null {
  const m = location.hash.match(new RegExp(`${ANCRE}([a-z0-9]+)`));
  if (!m) return null;
  const marque = GM_getValue<Marque | null>(CLE_ONGLET_DE_FOND, null);
  if (!marque || marque.nonce !== m[1] || Date.now() - marque.quand > MARQUE_VALIDE_MS) return null;
  GM_setValue(CLE_ONGLET_DE_FOND, null);
  return marque;
}

/** Le tableau peut arriver après le chargement (injecté par JavaScript). */
async function attendreTableau() {
  const fin = Date.now() + ATTENTE_TABLEAU_MS;
  while (Date.now() < fin && !document.querySelector('.draw-item, .js-player-row')) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function traiterOngletDeFond(marque: Marque) {
  const fermer = () => {
    try {
      window.close();
    } catch {
      /* fermeture refusée : la sécurité côté ouvreur prendra le relais */
    }
  };
  setTimeout(fermer, FERMETURE_SECURITE_MS);
  try {
    const j = GM_getValue<string>(CLE_JETON, '');
    if (!j) return; // jamais de saisie de jeton dans un onglet invisible
    const etat = await appeler('GET', '/api/import-auto/etat', j);
    const t = ((etat.json?.tournois as TournoiEtat[]) ?? []).find((x) => x.tournament_id === marque.tournament_id);
    // Arrêté (absent de la liste), plus dû, ou pas cette page : on ne fait rien.
    if (etat.status !== 200 || !t || !t.du || !surCettePage(t.source_url)) return;
    await attendreTableau();
    noter(true, `onglet d'arrière-plan : ${await envoyer(t, j, extraireDepuisDocument(document, t.source_url))}`);
  } catch (e) {
    noter(false, `onglet d'arrière-plan : ${(e as Error).message}`);
  } finally {
    fermer();
  }
}

/* -------------------------------- Cycle --------------------------------- */

async function cycle() {
  const circuit = circuitDeUrl(location.href);
  if (!circuit) return;
  const j = jeton();
  if (!j) return;
  const verrou = await prendreVerrou();
  if (!verrou) return;
  try {
    const etat = await appeler('GET', '/api/import-auto/etat', j);
    if (etat.status === 401 || etat.status === 404) {
      // Jeton faux, IMPORT_AUTO_TOKEN absent côté serveur, ou routes pas
      // encore déployées : indiscernables (le serveur ne révèle rien). Le
      // jeton n'est oublié qu'après plusieurs refus d'affilée, pour ne pas le
      // redemander à cause d'une panne passagère.
      const refus = GM_getValue<number>(CLE_REFUS_CONSECUTIFS, 0) + 1;
      if (refus >= REFUS_AVANT_OUBLI) {
        GM_setValue(CLE_JETON, '');
        GM_setValue(CLE_REFUS_CONSECUTIFS, 0);
        noter(false, `refusé ${refus} fois de suite : jeton oublié, il sera redemandé`);
      } else {
        GM_setValue(CLE_REFUS_CONSECUTIFS, refus);
        noter(false, `refusé (HTTP ${etat.status}) : jeton faux ou import auto pas encore en production`);
      }
      return;
    }
    GM_setValue(CLE_REFUS_CONSECUTIFS, 0);
    if (etat.status !== 200 || !etat.json) {
      noter(false, `état HTTP ${etat.status}`);
      return;
    }
    const tournois = ((etat.json.tournois as TournoiEtat[]) ?? []).filter(
      (t) =>
        t.du &&
        circuitDeUrl(t.source_url) === circuit &&
        (t.tour === 'ATP' || t.mode === 'navigateur'),
    );
    for (const t of tournois) {
      const nom = (() => {
        try {
          return new URL(t.source_url).pathname.split('/').filter(Boolean).slice(-3, -1).join('/');
        } catch {
          return t.tournament_id.slice(0, 8);
        }
      })();
      try {
        const r = await traiter(t, j);
        noter(true, `${nom} : ${r.texte}`, r.enCours);
      } catch (e) {
        noter(false, `${nom} : ${(e as Error).message}`);
      }
    }
  } catch (e) {
    noter(false, (e as Error).message);
  } finally {
    rendreVerrou(verrou);
  }
}

afficherBadge(GM_getValue<Dernier | null>(CLE_DERNIER, null));
const marque = marqueOngletDeFond();
if (marque) {
  // Onglet ouvert par le script : un seul traitement, puis fermeture. Pas de
  // cycle périodique ici (il doublonnerait l'envoi).
  traiterOngletDeFond(marque);
} else {
  setTimeout(cycle, 5_000);
  setInterval(cycle, INTERVALLE_MS);
}
