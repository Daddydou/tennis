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
 *   3. extraction + contrôle (parseExtract/verifierExtraction) ; 0 match =>
 *      échec signalé au serveur, jamais d'import du vide ; sinon POST /ingest.
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
  onload: (r: { status: number; responseText: string }) => void;
  onerror: () => void;
  ontimeout: () => void;
}): void;

const BASE = 'https://tennis-nine-zeta.vercel.app';
const CLE_JETON = 'importAuto.jeton';
const CLE_REFUS = 'importAuto.jetonRefuseLe';
const CLE_VERROU = 'importAuto.verrou';
const CLE_DERNIER = 'importAuto.dernier';
const INTERVALLE_MS = 30 * 60 * 1000;
const VERROU_MS = 10 * 60 * 1000;
const UNE_JOURNEE = 24 * 60 * 60 * 1000;

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
  el.style.background = d.ok ? '#15803d' : '#b91c1c';
  el.textContent = `Import auto ${d.ok ? 'OK' : 'ERREUR'} · ${heure} · ${d.texte}`;
}

function noter(ok: boolean, texte: string) {
  const d: Dernier = { ok, quand: Date.now(), texte };
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

async function documentDe(url: string): Promise<Document> {
  if (surCettePage(url)) return document;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur la page draws`);
  return new DOMParser().parseFromString(await res.text(), 'text/html');
}

async function traiter(t: TournoiEtat, j: string): Promise<string> {
  let doc: Document;
  try {
    doc = await documentDe(t.source_url);
  } catch (e) {
    await appeler('POST', '/api/import-auto/ingest', j, { tournament_id: t.tournament_id, echec: (e as Error).message });
    throw e;
  }
  const extrait = extraireDepuisDocument(doc, t.source_url);
  const controle = controlerExtrait(extrait);
  if (!controle.ok) {
    await appeler('POST', '/api/import-auto/ingest', j, { tournament_id: t.tournament_id, echec: controle.erreur });
    throw new Error(controle.erreur);
  }
  const r = await appeler('POST', '/api/import-auto/ingest', j, { tournament_id: t.tournament_id, json: extrait });
  if (r.status !== 200) throw new Error(String(r.json?.detail ?? r.json?.error ?? `HTTP ${r.status}`));
  return r.json?.statut === 'inchange' ? 'inchangé' : `${r.json?.matchs_changes ?? '?'} matchs changés`;
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
    if (etat.status === 404) {
      // Jeton refusé (faux, ou IMPORT_AUTO_TOKEN absent côté serveur) : on l'oublie.
      GM_setValue(CLE_JETON, '');
      noter(false, 'jeton refusé — il sera redemandé');
      return;
    }
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
        noter(true, `${nom} : ${await traiter(t, j)}`);
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
setTimeout(cycle, 5_000);
setInterval(cycle, INTERVALLE_MS);
