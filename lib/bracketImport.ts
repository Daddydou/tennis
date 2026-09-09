/**
 * IMPORT DE BRACKET DE PARTICIPANT — extracteur externe (Game Tracker)
 *
 * Un bookmarklet sur le site du jeu produit, PAR PARTICIPANT, un JSON listant
 * son pronostic de vainqueur pour chaque match de chaque tour déjà révélé
 * (le jeu ne dévoile les pronostics que tour par tour). Ce module est PUR
 * (aucune I/O, aucun Supabase) : il ne fait que valider la forme du JSON et
 * rattacher ses noms aux entités de l'app (participant du groupe, joueurs du
 * tableau) — l'écriture en base vit dans la Server Action qui l'appelle
 * (app/tournoi/[id]/simulateur/importActions.ts).
 *
 * Rattachement des noms de joueurs : le jeu écrit « Prénom NOM » quand
 * l'app stocke « P. Nom » — `apparierNom`/`indexerJoueursTableau`
 * (lib/matching.ts, déjà utilisé pour les cotes bookmakers) réduisent les
 * deux à la même clé canonique. Un nom non rattaché (absent ou ambigu) est
 * SIGNALÉ, jamais tu : le match correspondant n'est simplement pas importé.
 *
 * Mapping des tours : l'extracteur fournit déjà le code normalisé du tour
 * (R128, R64, QF…) — la seule vérification qui reste ici est qu'il existe
 * bien dans le tableau réel de CE tournoi (`tournament.rounds`) : un
 * tableau de 32 commence à R32, pas R128, et un code absent de cette liste
 * ne correspond à aucun emplacement réel.
 */
import { apparierNom, indexerJoueursTableau } from './matching';

export type StatutPronostic = 'correct' | 'incorrect' | 'en_attente';

export interface MatchImporte {
  position: number;
  joueurs: [string, string];
  pronostique: string;
  statut: StatutPronostic;
}

export interface TourImporte {
  tour: string;
  matchs: MatchImporte[];
}

export interface ExtraitBracketParticipant {
  participant: string;
  tours: TourImporte[];
}

/** Valide et normalise le JSON brut de l'extracteur — lève une erreur lisible sinon. */
export function parseExtraitBracket(raw: unknown): ExtraitBracketParticipant {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('objet JSON attendu à la racine.');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.participant !== 'string' || !o.participant.trim()) {
    throw new Error('champ "participant" manquant ou vide.');
  }
  if (!Array.isArray(o.tours)) throw new Error('champ "tours" manquant ou n\'est pas un tableau.');

  const tours: TourImporte[] = o.tours.map((t, i) => {
    if (typeof t !== 'object' || t === null) throw new Error(`tours[${i}] : objet attendu.`);
    const to = t as Record<string, unknown>;
    if (typeof to.tour !== 'string' || !to.tour.trim()) throw new Error(`tours[${i}].tour manquant.`);
    if (!Array.isArray(to.matchs)) throw new Error(`tours[${i}].matchs manquant ou n'est pas un tableau.`);

    const matchs: MatchImporte[] = to.matchs.map((m, j) => {
      if (typeof m !== 'object' || m === null) throw new Error(`tours[${i}].matchs[${j}] : objet attendu.`);
      const mo = m as Record<string, unknown>;
      if (typeof mo.position !== 'number' || !Number.isInteger(mo.position) || mo.position < 0) {
        throw new Error(`tours[${i}].matchs[${j}].position invalide (entier >= 0 attendu).`);
      }
      if (
        !Array.isArray(mo.joueurs) ||
        mo.joueurs.length !== 2 ||
        typeof mo.joueurs[0] !== 'string' ||
        typeof mo.joueurs[1] !== 'string'
      ) {
        throw new Error(`tours[${i}].matchs[${j}].joueurs doit contenir exactement 2 noms.`);
      }
      if (typeof mo.pronostique !== 'string' || !mo.pronostique.trim()) {
        throw new Error(`tours[${i}].matchs[${j}].pronostique manquant.`);
      }
      if (mo.statut !== 'correct' && mo.statut !== 'incorrect' && mo.statut !== 'en_attente') {
        throw new Error(`tours[${i}].matchs[${j}].statut invalide : « ${String(mo.statut)} ».`);
      }
      return {
        position: mo.position,
        joueurs: [mo.joueurs[0], mo.joueurs[1]] as [string, string],
        pronostique: mo.pronostique,
        statut: mo.statut,
      };
    });

    return { tour: to.tour, matchs };
  });

  return { participant: o.participant, tours };
}

/** Un nom de joueur qui n'a pas pu être rattaché à un joueur du tableau — signalé, jamais tu. */
export interface NonApparie {
  nom: string;
  raison: 'absent' | 'ambigu';
  /** Tour/position du match concerné, pour retrouver le contexte dans le JSON. */
  contexte: string;
  candidats?: string[];
}

/** Un pronostic résolu, prêt à écrire (tn_bracket_round_picks). */
export interface PronosticResolu {
  round: string;
  position: number;
  playerId: string;
}

export interface ResultatResolutionBracket {
  picks: PronosticResolu[];
  /** Tours du JSON absents du tableau réel de ce tournoi — aucun de leurs matchs n'est importé. */
  toursIgnores: { tour: string; raison: string }[];
  nonApparies: NonApparie[];
  /** Le nom pronostiqué ne correspond à AUCUN des deux joueurs du duel — JSON incohérent. */
  incoherences: { contexte: string; pronostique: string; joueurs: [string, string] }[];
}

/**
 * Rattache les noms d'un extrait aux joueurs du tableau et vérifie ses tours
 * contre la liste réelle des tours du tournoi.
 */
export function resoudreExtraitBracket(
  extrait: ExtraitBracketParticipant,
  rounds: string[],
  joueursDuTableau: { id: string; name: string }[],
): ResultatResolutionBracket {
  const index = indexerJoueursTableau(joueursDuTableau);
  const picks: PronosticResolu[] = [];
  const toursIgnores: ResultatResolutionBracket['toursIgnores'] = [];
  const nonApparies: NonApparie[] = [];
  const incoherences: ResultatResolutionBracket['incoherences'] = [];

  for (const t of extrait.tours) {
    if (!rounds.includes(t.tour)) {
      toursIgnores.push({
        tour: t.tour,
        raison: `absent du tableau réel de ce tournoi (tours : ${rounds.join(', ') || 'aucun'})`,
      });
      continue;
    }

    for (const m of t.matchs) {
      const contexte = `${t.tour}/${m.position}`;
      const resolus = m.joueurs.map((nom) => {
        const { id, echec } = apparierNom(index, nom);
        if (echec) nonApparies.push({ nom: echec.nom, raison: echec.raison, contexte, candidats: echec.candidats });
        return { nom, id };
      });

      const gagnant = resolus.find((r) => r.nom === m.pronostique);
      if (!gagnant) {
        incoherences.push({ contexte, pronostique: m.pronostique, joueurs: m.joueurs });
        continue;
      }
      if (gagnant.id) picks.push({ round: t.tour, position: m.position, playerId: gagnant.id });
      // Sinon : déjà signalé dans `nonApparies` ci-dessus (le nom pronostiqué
      // lui-même n'a pas pu être rattaché) — pas de doublon d'avertissement.
    }
  }

  return { picks, toursIgnores, nonApparies, incoherences };
}

/* -------------------------------------------------------------------------- */
/*  PARTICIPANT DU JEU -> STOCK DE L'APP                                       */
/*                                                                            */
/*  Outil mono-groupe, trois personnes fixes : Daddy est moi                  */
/*  (participant_id NULL, convention tn_picks/tn_bracket_round_picks), Laki   */
/*  et moustiton (pseudo du jeu) sont des participants configurés dans        */
/*  tn_participants — retrouvés par leur NOM RÉEL ('Laki', 'Thomas'), jamais  */
/*  un ID codé en dur, pour rester valides même si la ligne est un jour       */
/*  recréée (nouvel id).                                                     */
/* -------------------------------------------------------------------------- */
const ALIAS_VERS_NOM_PARTICIPANT: Record<string, string | null> = {
  Daddy: null, // moi
  Laki: 'Laki',
  moustiton: 'Thomas',
};

export type ResolutionParticipant =
  | { ok: true; stockId: string | null } // null = moi
  | { ok: false; error: string };

/** Rattache l'alias `participant` du JSON à un stock ('moi' si null) — erreur explicite sinon. */
export function resoudreParticipant(
  aliasJeu: string,
  participants: { id: string; name: string }[],
): ResolutionParticipant {
  if (!(aliasJeu in ALIAS_VERS_NOM_PARTICIPANT)) {
    return {
      ok: false,
      error: `Participant du jeu inconnu : « ${aliasJeu} » (attendu ${Object.keys(ALIAS_VERS_NOM_PARTICIPANT).join(', ')}).`,
    };
  }
  const nom = ALIAS_VERS_NOM_PARTICIPANT[aliasJeu];
  if (nom === null) return { ok: true, stockId: null };
  const p = participants.find((p) => p.name === nom);
  if (!p) {
    return { ok: false, error: `Participant « ${nom} » (alias jeu « ${aliasJeu} ») introuvable dans tn_participants.` };
  }
  return { ok: true, stockId: p.id };
}
