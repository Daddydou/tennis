import type { SupabaseClient } from '@supabase/supabase-js';
import type { Moitie } from '@/lib/masters';
import {
  appairerRemplacements,
  moitieParAdversaires,
  phraseAlias,
  phraseRemplacement,
  reconnaitreAlias,
  type CandidatAlias,
  type Entrante,
  type JoueuseTournoi,
} from '@/lib/mastersRemplacement';
import { trouverJoueur, type JoueurBase } from '@/lib/mastersImport';

/**
 * REMPLAÇANTE D'UN MASTERS : applique à la base le remplacement d'une joueuse (forfait avant le tournoi).
 *
 * Appelé AVANT de lire les joueuses du tournoi par les trois gestes qui reçoivent une liste de noms
 * (Lire Game Tracker, Actualiser les résultats / cron, Importer le tableau). La logique de décision est dans
 * lib/mastersRemplacement.ts ; ici on lit la base, on retrouve la remplaçante, on écrit (si demandé).
 *
 * Écritures : uniquement tn_matches.player1_id / player2_id de l'absente vers la remplaçante, sur des
 * matchs non joués. Jamais de suppression, jamais de création de joueuse, tn_picks n'est pas touché
 * (la lecture de Game Tracker réaligne les picks des tours verrouillés).
 *
 * ALIAS (remplacement EN COURS de tournoi) : quand une joueuse a été remplacée après avoir joué et que la
 * remplaçante a pris sa place sur tout le tournoi chez nous, les sources gardent l'ancien nom pour ses premiers
 * matchs (API tennis, Game Tracker). On le reconnaît (lib/mastersRemplacement.ts : reconnaitreAlias) et on
 * l'ajoute à `joueurs` comme une entrée de plus qui pointe vers la même joueuse. AUCUNE écriture pour un alias.
 */

/** Un nom reçu de Game Tracker ou de l'API. `adversaires` aide à trouver la poule quand la source ne la donne pas. */
export interface NomRecu {
  prenom: string | null;
  nom: string | null;
  moitie?: Moitie | null;
  adversaires?: { prenom: string | null; nom: string | null }[];
}

export interface ResultatRemplacements {
  /** Les joueuses du tournoi APRÈS remplacement (même en simulation : la liste est élargie en mémoire). */
  joueurs: JoueurBase[];
  /** Phrases lisibles : « Kostyuk remplace Rybakina ». */
  messages: string[];
  erreurs: string[];
  /** Pour chaque remplacement : l'ancienne joueuse et la nouvelle (sert à corriger des lignes déjà lues). */
  echanges: { ancienId: string; nouveauId: string }[];
  /** Vrai si la base a été modifiée. */
  ecrit: boolean;
  /**
   * Anciens noms encore utilisés par les sources (« K. Muchova » -> id de Shnaider). Déjà ajoutés à `joueurs` ;
   * listés ici pour les appelants qui relisent les joueuses du tournoi eux-mêmes.
   */
  alias: JoueurBase[];
}

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data as T;
}

const introuvable = (erreur: string) => erreur.startsWith('Joueur introuvable');

/** Dernier mot du nom de famille, nettoyé des caractères spéciaux du filtre ilike. */
function motDeRecherche(nom: string | null): string {
  const mots = (nom ?? '').trim().split(/\s+/);
  return (mots[mots.length - 1] ?? '').replace(/[%_\\,()]/g, '');
}

/** Le nom reçu est-il une joueuse de la base du circuit ? (même recherche que pour une remplaçante, aucune création) */
async function retrouverEnBase(sb: SupabaseClient, tour: string, e: Entrante): Promise<JoueurBase | null> {
  const mot = motDeRecherche(e.nom);
  if (!mot) return null;
  const candidats = await lire<JoueurBase[]>(sb.from('tn_players').select('id, name').eq('tour', tour).ilike('name', `%${mot}`), 'tn_players');
  const trouve = trouverJoueur(e.prenom, e.nom, candidats);
  return trouve.ok ? (candidats.find((c) => c.id === trouve.id) ?? null) : null;
}

export async function appliquerRemplacementsMasters(
  sb: SupabaseClient,
  tournamentId: string,
  recus: NomRecu[],
  ecrire: boolean,
): Promise<ResultatRemplacements> {
  const rows = await lire<{ round: string; half: Moitie | null; player1_id: string | null; player2_id: string | null; winner_id: string | null; status: string }[]>(
    sb.from('tn_matches').select('round, half, player1_id, player2_id, winner_id, status').eq('tournament_id', tournamentId),
    'tn_matches',
  );
  const ids = [...new Set(rows.flatMap((r) => [r.player1_id, r.player2_id]).filter((x): x is string => x !== null))];
  const lignes = ids.length ? await lire<JoueurBase[]>(sb.from('tn_players').select('id, name').in('id', ids), 'tn_players') : [];
  const rien = (erreurs: string[] = []): ResultatRemplacements => ({ joueurs: lignes, messages: [], erreurs, echanges: [], ecrit: false, alias: [] });

  // Qui est reconnu dans la liste reçue, qui ne l'est pas ?
  const connues = new Set<string>();
  const adversairesRecus = new Map<string, Set<string>>(); // joueuse du tournoi -> ses adversaires d'après la source
  const inconnus: NomRecu[] = [];
  for (const r of recus) {
    const t = trouverJoueur(r.prenom, r.nom, lignes);
    if (t.ok) {
      connues.add(t.id);
      const adv = (r.adversaires ?? []).map((a) => trouverJoueur(a.prenom, a.nom, lignes)).flatMap((x) => (x.ok ? [x.id] : []));
      adversairesRecus.set(t.id, new Set(adv));
    } else if (introuvable(t.erreur)) inconnus.push(r);
    else return rien([t.erreur]); // ambigu : ce n'est pas un remplacement, on laisse l'appelant le signaler
  }
  if (inconnus.length === 0) return rien();

  // Poule et état de chaque joueuse du tournoi, lus sur ses matchs.
  const moitieDe = new Map<string, Moitie>();
  const aJoue = new Set<string>();
  for (const r of rows) {
    for (const id of [r.player1_id, r.player2_id]) {
      if (!id) continue;
      if (['J1', 'J2', 'J3'].includes(r.round) && r.half) moitieDe.set(id, r.half);
      if (r.winner_id !== null || r.status !== 'scheduled') aJoue.add(id);
    }
  }
  const absentes: JoueuseTournoi[] = lignes
    .filter((j) => !connues.has(j.id))
    .map((j) => ({ id: j.id, name: j.name, moitie: moitieDe.get(j.id) ?? null, aJoue: aJoue.has(j.id) }));

  const resolus = inconnus.map((r) => {
    const trouves = (r.adversaires ?? []).map((a) => trouverJoueur(a.prenom, a.nom, lignes));
    return { ids: trouves.flatMap((x) => (x.ok ? [x.id] : [])), tous: trouves.length > 0 && trouves.every((x) => x.ok) };
  });
  const entrantes: Entrante[] = inconnus.map((r, i) => ({
    prenom: r.prenom,
    nom: r.nom,
    moitie: r.moitie ?? moitieParAdversaires(resolus[i].ids, moitieDe),
  }));

  const t = await lire<{ tour: string } | null>(sb.from('tn_tournaments').select('tour').eq('id', tournamentId).maybeSingle(), 'tn_tournaments');
  if (!t) return rien(['Tournoi introuvable.']);

  // Un ancien nom encore utilisé par les sources (remplacement en cours de tournoi) n'est PAS une remplaçante :
  // c'est la joueuse qui occupe déjà la place chez nous. Aucune écriture.
  const tournoi: JoueuseTournoi[] = lignes.map((j) => ({ id: j.id, name: j.name, moitie: moitieDe.get(j.id) ?? null, aJoue: aJoue.has(j.id) }));
  const enBase = new Map<Entrante, JoueurBase>();
  const candidatsAlias: CandidatAlias[] = [];
  for (let i = 0; i < entrantes.length; i++) {
    const trouvee = await retrouverEnBase(sb, t.tour, entrantes[i]);
    if (trouvee) enBase.set(entrantes[i], trouvee);
    candidatsAlias.push({ entrante: entrantes[i], adversairesIds: resolus[i].tous ? resolus[i].ids : null, connueEnBase: trouvee !== null });
  }
  const { alias, restantes } = reconnaitreAlias(candidatsAlias, tournoi, absentes, adversairesRecus);
  const aliasEntrees: JoueurBase[] = alias.map((a) => ({ id: a.joueuseId, name: enBase.get(a.entrante)!.name }));
  const messagesAlias = alias.map(phraseAlias);
  const absentesRestantes = absentes.filter((a) => !alias.some((x) => x.joueuseId === a.id));
  if (restantes.length === 0) {
    return { joueurs: [...lignes, ...aliasEntrees], messages: messagesAlias, erreurs: [], echanges: [], ecrit: false, alias: aliasEntrees };
  }

  const { remplacements, erreurs } = appairerRemplacements(absentesRestantes, restantes);
  if (erreurs.length) return rien(erreurs);

  // Retrouver chaque remplaçante dans la base des joueuses du circuit (jamais de création).
  const nouvelles: { absenteId: string; nouvelle: JoueurBase; message: string }[] = [];
  for (const r of remplacements) {
    const mot = motDeRecherche(r.entrante.nom);
    if (!mot) return rien([`Nom de remplaçante vide (${r.absenteNom}) : rien n'a été écrit.`]);
    const candidats = await lire<JoueurBase[]>(sb.from('tn_players').select('id, name').eq('tour', t.tour).ilike('name', `%${mot}`), 'tn_players');
    const trouve = trouverJoueur(r.entrante.prenom, r.entrante.nom, candidats);
    if (!trouve.ok) {
      return rien([`${trouve.erreur} Elle remplace ${r.absenteNom} mais n'est pas dans notre base : ajoute-la d'abord. Rien n'a été écrit.`]);
    }
    const nouvelle = candidats.find((c) => c.id === trouve.id)!;
    if (lignes.some((j) => j.id === nouvelle.id)) return rien([`${nouvelle.name} est déjà dans ce tournoi : rien n'a été écrit.`]);
    nouvelles.push({ absenteId: r.absenteId, nouvelle, message: phraseRemplacement(r, nouvelle.name) });
  }

  // Liste des joueuses après remplacement (utile aussi en simulation).
  const apres = lignes.map((j) => nouvelles.find((n) => n.absenteId === j.id)?.nouvelle ?? j);

  if (ecrire) {
    for (const n of nouvelles) {
      for (const colonne of ['player1_id', 'player2_id'] as const) {
        const { error } = await sb
          .from('tn_matches')
          .update({ [colonne]: n.nouvelle.id, updated_at: new Date().toISOString() })
          .eq('tournament_id', tournamentId)
          .eq(colonne, n.absenteId)
          .is('winner_id', null)
          .eq('status', 'scheduled');
        if (error) throw new Error(`tn_matches (remplacement ${n.message}) : ${error.message}`);
      }
    }
  }
  return {
    joueurs: [...apres, ...aliasEntrees],
    messages: [...messagesAlias, ...nouvelles.map((n) => n.message)],
    erreurs: [],
    echanges: nouvelles.map((n) => ({ ancienId: n.absenteId, nouveauId: n.nouvelle.id })),
    ecrit: ecrire,
    alias: aliasEntrees,
  };
}
