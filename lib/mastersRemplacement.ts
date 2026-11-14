/**
 * REMPLAÇANTE DANS UN MASTERS - logique PURE (aucun import React / Next / Supabase).
 *
 * Quand une joueuse déclare forfait avant le Masters, une remplaçante entre dans sa poule. Game Tracker et
 * l'API tennis donnent alors un nom que notre base ne connaît pas encore dans CE tournoi (la liste des
 * joueuses d'un tournoi vient de ses matchs). Ici on décide, sans rien écrire :
 *  - qui est « absente » (chez nous, mais plus dans la liste reçue),
 *  - qui est « entrante » (dans la liste reçue, mais pas chez nous),
 *  - quelle entrante remplace quelle absente.
 *
 * Règle de prudence : on n'associe que si c'est sans ambiguïté, et jamais une absente qui a déjà joué
 * (un match joué ou décidé ne se réécrit pas). Au moindre doute on renvoie une erreur claire et RIEN
 * n'est modifié.
 */
import type { MatchApi } from './extract/matchstat';
import type { EtatGT } from './gameTrackerPicks';
import type { Moitie } from './masters';

/** Une joueuse du tournoi telle que notre base la connaît. */
export interface JoueuseTournoi {
  id: string;
  name: string;
  /** Sa poule (A = top, B = bottom), lue sur ses matchs de poule ; null si inconnue. */
  moitie: Moitie | null;
  /** A un match joué, en cours ou décidé : on ne la remplace jamais. */
  aJoue: boolean;
}

/** Un nom reçu (Game Tracker ou API) que notre base ne retrouve pas dans le tournoi. */
export interface Entrante {
  prenom: string | null;
  nom: string | null;
  /** Sa poule si la source la donne (Game Tracker) ou si on la déduit de ses adversaires ; sinon null. */
  moitie: Moitie | null;
}

export interface Remplacement {
  absenteId: string;
  absenteNom: string;
  entrante: Entrante;
}

const libelle = (e: Entrante) => `${e.prenom ?? ''} ${e.nom ?? ''}`.trim() || 'joueuse sans nom';

/**
 * Poule d'une entrante déduite de ses adversaires : la poule de ses adversaires déjà connus.
 * Renvoie null si aucun adversaire connu, ou si les adversaires sont dans des poules différentes (incohérent).
 */
export function moitieParAdversaires(adversairesIds: string[], moitieDe: Map<string, Moitie>): Moitie | null {
  const vues = new Set<Moitie>();
  for (const id of adversairesIds) {
    const m = moitieDe.get(id);
    if (m) vues.add(m);
  }
  return vues.size === 1 ? [...vues][0] : null;
}

/**
 * Associe chaque entrante à une absente.
 *  - 1 absente remplaçable + 1 entrante : association directe.
 *  - sinon : par poule (une seule de chaque dans la poule) ; une poule inconnue ou ambiguë = erreur.
 * Les absentes qui ont déjà joué ne sont jamais remplacées : si une entrante n'a que celles-là, erreur.
 */
export function appairerRemplacements(absentes: JoueuseTournoi[], entrantes: Entrante[]): { remplacements: Remplacement[]; erreurs: string[] } {
  if (entrantes.length === 0) return { remplacements: [], erreurs: [] };

  // Garde-fou : une vraie remplaçante = autant de noms inconnus que de joueuses disparues. Sinon la liste reçue est
  // incomplète ou incohérente (match pas encore publié, erreur de nom...) et on ne devine rien.
  if (absentes.length !== entrantes.length) {
    const noms = entrantes.map(libelle).join(', ');
    return {
      remplacements: [],
      erreurs: [`Joueur introuvable dans la base : ${noms}. Ce n'est pas une simple remplaçante (${entrantes.length} nom(s) inconnu(s) pour ${absentes.length} joueuse(s) absente(s) de la liste reçue). Rien n'a été écrit.`],
    };
  }

  const remplacables = absentes.filter((a) => !a.aJoue);
  const dejaJouees = absentes.filter((a) => a.aJoue);

  if (remplacables.length < entrantes.length) {
    const noms = entrantes.map(libelle).join(', ');
    const raison = dejaJouees.length
      ? ` (${dejaJouees.map((a) => a.name).join(', ')} a déjà joué : on ne la remplace pas)`
      : '';
    return {
      remplacements: [],
      erreurs: [`Joueuse inconnue dans ce tournoi : ${noms}, et aucune joueuse absente à remplacer${raison}. Rien n'a été écrit.`],
    };
  }

  // Cas simple : autant d'entrantes que de joueuses remplaçables.
  if (entrantes.length === 1 && remplacables.length === 1) {
    return { remplacements: [{ absenteId: remplacables[0].id, absenteNom: remplacables[0].name, entrante: entrantes[0] }], erreurs: [] };
  }

  // Cas général : par poule.
  const erreurs: string[] = [];
  const remplacements: Remplacement[] = [];
  const prises = new Set<string>();
  for (const e of entrantes) {
    if (!e.moitie) {
      erreurs.push(`${libelle(e)} : poule inconnue, impossible de savoir qui elle remplace.`);
      continue;
    }
    const candidates = remplacables.filter((a) => a.moitie === e.moitie && !prises.has(a.id));
    if (candidates.length !== 1) {
      erreurs.push(
        candidates.length === 0
          ? `${libelle(e)} : aucune joueuse absente dans sa poule.`
          : `${libelle(e)} : plusieurs joueuses absentes dans sa poule (${candidates.map((a) => a.name).join(', ')}), choix impossible.`,
      );
      continue;
    }
    prises.add(candidates[0].id);
    remplacements.push({ absenteId: candidates[0].id, absenteNom: candidates[0].name, entrante: e });
  }
  if (erreurs.length) return { remplacements: [], erreurs: [...erreurs, 'Rien n\'a été écrit.'] };
  return { remplacements, erreurs: [] };
}

export interface NomGT {
  prenom: string | null;
  nom: string | null;
  moitie: Moitie | null;
}

/**
 * Tous les noms de joueuses que Game Tracker montre, dédoublonnés, avec leur poule quand elle est sûre
 * (journées de poules 1 à 3 : `haut` = poule A = top, `bas` = poule B = bottom ; demie et finale : pas de poule).
 */
export function nomsDeGameTracker(etat: EtatGT): NomGT[] {
  const noms = new Map<string, NomGT>();
  const noter = (p: { prenom: string | null; nom: string | null } | null, numero: number, cote: 'haut' | 'bas') => {
    if (!p || (!p.prenom && !p.nom)) return;
    const moitie: Moitie | null = numero >= 1 && numero <= 3 ? (cote === 'haut' ? 'top' : 'bottom') : null;
    const cle = `${(p.prenom ?? '').toLowerCase()}|${(p.nom ?? '').toLowerCase()}`;
    const deja = noms.get(cle);
    if (!deja) noms.set(cle, { prenom: p.prenom, nom: p.nom, moitie });
    else if (!deja.moitie && moitie) deja.moitie = moitie;
  };
  for (const t of [etat.tourOuvert, ...etat.toursAVenir]) {
    if (!t) continue;
    for (const j of t.pool.haut) noter(j, t.numero, 'haut');
    for (const j of t.pool.bas) noter(j, t.numero, 'bas');
    noter(t.monPick.haut, t.numero, 'haut');
    noter(t.monPick.bas, t.numero, 'bas');
  }
  for (const t of etat.tours) {
    for (const pk of t.picks) {
      noter(pk.haut, t.numero, 'haut');
      noter(pk.bas, t.numero, 'bas');
    }
  }
  for (const p of etat.dejaPickes) noter(p, 0, 'haut');
  return [...noms.values()];
}

export interface NomApi {
  prenom: string | null;
  nom: string | null;
  adversaires: { prenom: string | null; nom: string | null }[];
}

const decouper = (nomComplet: string) => {
  const mots = nomComplet.trim().split(/\s+/);
  return { prenom: mots[0] ?? null, nom: mots.slice(1).join(' ') || null };
};

/**
 * Les joueuses de l'API tennis (singles), dédoublonnées, chacune avec ses adversaires (ils servent à trouver sa
 * poule : dans une poule on joue contre toutes les autres joueuses de cette poule).
 */
export function nomsDeApi(singles: MatchApi[]): NomApi[] {
  const noms = new Map<string, NomApi>();
  for (const m of singles) {
    const [a, b] = [m.player1, m.player2];
    if (!a?.name || !b?.name || a.tbd || b.tbd || a.bye || b.bye) continue;
    for (const [moi, autre] of [[a.name, b.name], [b.name, a.name]] as const) {
      const cle = moi.trim().toLowerCase();
      const existant = noms.get(cle) ?? { ...decouper(moi), adversaires: [] };
      existant.adversaires.push(decouper(autre));
      noms.set(cle, existant);
    }
  }
  return [...noms.values()];
}
/** Phrase pour l'utilisateur : « Kostyuk remplace Rybakina ». */
export function phraseRemplacement(r: Remplacement, nomNouvelle: string): string {
  return `${nomNouvelle} remplace ${r.absenteNom}`;
}

/* ------------------------------------------------------------------ */
/*  Remplacement EN COURS de tournoi : l'ancien nom reste utilisé       */
/* ------------------------------------------------------------------ */

/**
 * Une joueuse est remplacée APRÈS avoir joué (ex. Muchova remplacée par Shnaider en WTA Finals 2026) et chez nous
 * la remplaçante a pris sa place sur TOUT le tournoi (elle garde ses matchs et ses points des premières journées).
 * Les sources, elles, continuent à utiliser l'ancien nom pour ces matchs : l'API tennis met « Muchova » en J1 et J2
 * puis « Shnaider » en J3, Game Tracker garde « Muchova » partout. Sans traitement, ce nom est « inconnu dans le
 * tournoi » et tout l'import est refusé.
 *
 * Ici on reconnaît ce cas SANS RIEN ÉCRIRE : l'ancien nom est un ALIAS de la joueuse qui occupe la place chez nous.
 * Deux preuves, jamais de devinette :
 *  1. par les adversaires (API tennis) : l'ancien nom et une joueuse du tournoi ne se rencontrent jamais, n'ont aucun
 *     adversaire en commun et, à deux, ont joué toutes les autres joueuses de la poule (une place, deux noms) ;
 *  2. par la poule (Game Tracker) : une seule joueuse de la poule a disparu de la liste reçue, elle a déjà joué, et
 *     un seul nom inconnu apparaît dans cette poule.
 * Dans les deux cas le nom inconnu doit être une vraie joueuse de la base du circuit.
 */
export interface CandidatAlias {
  entrante: Entrante;
  /** Ids (chez nous) des adversaires du nom inconnu d'après la source, ou null si la source n'en donne pas / si l'un n'est pas retrouvé. */
  adversairesIds: string[] | null;
  /** Le nom inconnu est une joueuse de la base du circuit (sinon : faute de frappe probable, jamais d'alias). */
  connueEnBase: boolean;
}

export interface AliasMasters {
  entrante: Entrante;
  joueuseId: string;
  joueuseNom: string;
  /** Sur quelle preuve : les adversaires (API) ou la poule (Game Tracker). */
  preuve: 'adversaires' | 'poule';
}

/**
 * @param tournoi         toutes les joueuses du tournoi chez nous (avec leur poule)
 * @param absentes        celles qui ne sont PAS dans la liste reçue
 * @param adversairesRecus pour chaque joueuse du tournoi présente dans la liste reçue : ses adversaires d'après la source
 */
export function reconnaitreAlias(
  candidats: CandidatAlias[],
  tournoi: JoueuseTournoi[],
  absentes: JoueuseTournoi[],
  adversairesRecus: Map<string, Set<string>>,
): { alias: AliasMasters[]; restantes: Entrante[] } {
  const alias: AliasMasters[] = [];
  const pris = new Set<string>();

  for (const c of candidats) {
    if (!c.connueEnBase) continue;
    const e = c.entrante;

    // Preuve 1 : les adversaires (API tennis).
    if (c.adversairesIds && c.adversairesIds.length > 0) {
      const advE = new Set(c.adversairesIds);
      const moitie = e.moitie ?? moitieDesAdversaires(c.adversairesIds, tournoi);
      if (moitie) {
        const poule = tournoi.filter((j) => j.moitie === moitie);
        const trouvees = poule.filter((s) => {
          if (advE.has(s.id)) return false; // elles se rencontrent : deux joueuses différentes
          const advS = adversairesRecus.get(s.id);
          if (!advS || advS.size === 0) return false;
          if ([...advS].some((x) => advE.has(x))) return false; // adversaire en commun : pas la même place
          const couverts = new Set([...advE, ...advS]);
          return poule.every((p) => p.id === s.id || couverts.has(p.id)) && [...couverts].every((x) => x !== s.id);
        });
        if (trouvees.length === 1) {
          alias.push({ entrante: e, joueuseId: trouvees[0].id, joueuseNom: trouvees[0].name, preuve: 'adversaires' });
          continue;
        }
      }
    }

    // Preuve 2 : la poule (Game Tracker).
    if (e.moitie) {
      const absentesPoule = absentes.filter((a) => a.moitie === e.moitie);
      const inconnuesPoule = candidats.filter((x) => x.entrante.moitie === e.moitie);
      if (absentesPoule.length === 1 && absentesPoule[0].aJoue && inconnuesPoule.length === 1) {
        alias.push({ entrante: e, joueuseId: absentesPoule[0].id, joueuseNom: absentesPoule[0].name, preuve: 'poule' });
      }
    }
  }

  // Deux noms inconnus pour la même place : ambigu, on n'en reconnaît aucun.
  for (const a of alias) pris.add(a.joueuseId);
  const doublons = new Set([...pris].filter((id) => alias.filter((a) => a.joueuseId === id).length > 1));
  const gardes = alias.filter((a) => !doublons.has(a.joueuseId));
  const restantes = candidats.map((c) => c.entrante).filter((e) => !gardes.some((a) => a.entrante === e));
  return { alias: gardes, restantes };
}

/** Poule des adversaires quand ils sont tous dans la même (ils jouent contre toute la poule de l'inconnue). */
function moitieDesAdversaires(adversairesIds: string[], tournoi: JoueuseTournoi[]): Moitie | null {
  const vues = new Set<Moitie>();
  for (const id of adversairesIds) {
    const m = tournoi.find((j) => j.id === id)?.moitie;
    if (m) vues.add(m);
  }
  return vues.size === 1 ? [...vues][0] : null;
}

/** Phrase pour l'utilisateur : « Karolina Muchova est le nom d'origine de D. Shnaider (même place) ». */
export function phraseAlias(a: AliasMasters): string {
  const nom = `${a.entrante.prenom ?? ''} ${a.entrante.nom ?? ''}`.trim();
  return `${nom} est le nom d'origine de ${a.joueuseNom} (même place dans le tournoi)`;
}
