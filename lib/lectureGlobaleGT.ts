/**
 * « Lire Game Tracker » depuis l'accueil : un seul bouton qui lit TOUS les
 * tournois en cours ou de la semaine (lecture seule, jamais d'envoi).
 *
 * Module PUR : transforme le résultat de `lireGameTracker` (un tournoi) en une
 * ligne lisible pour l'accueil. L'enchaînement des tournois et la garde de
 * session sont dans app/lireGameTrackerGlobal.ts.
 */

/** Ce qu'on lit d'une lecture de Game Tracker (sous-ensemble de `LectureGameTracker`). */
export type LectureResumable =
  | { ok: false; erreur: string }
  | { ok: true; lie: false }
  | {
      ok: true;
      lie: true;
      alignement: { ok: true; changements: string[]; avertissements: string[] } | { ok: false; raisons: string[] };
      resultatsRepris: string[];
    };

/** lu = lecture faite ; non-relie = pas de lien Game Tracker ; erreur = échec ; masters = ignoré ici. */
export type StatutLecture = 'lu' | 'non-relie' | 'erreur' | 'masters';

export interface LigneLecture {
  tournoiId: string;
  nom: string;
  statut: StatutLecture;
  /** Une phrase lisible. */
  detail: string;
  /** À regarder : avertissement ou alignement impossible (affiché en ambre). */
  attention: boolean;
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export function resumerLecture(r: LectureResumable): Pick<LigneLecture, 'statut' | 'detail' | 'attention'> {
  if (!r.ok) return { statut: 'erreur', detail: r.erreur, attention: true };
  if (!r.lie) {
    return {
      statut: 'non-relie',
      detail: 'Pas encore relié à Game Tracker : à faire depuis l’écran Picks du tournoi.',
      attention: false,
    };
  }
  const morceaux: string[] = [];
  let attention = false;
  if (r.alignement.ok) {
    if (r.alignement.changements.length > 0) {
      morceaux.push(`${pluriel(r.alignement.changements.length, 'pick')} aligné${r.alignement.changements.length > 1 ? 's' : ''} sur Game Tracker`);
    }
    if (r.alignement.avertissements.length > 0) {
      morceaux.push(pluriel(r.alignement.avertissements.length, 'avertissement'));
      attention = true;
    }
  } else {
    morceaux.push(`alignement impossible (${r.alignement.raisons[0] ?? 'raison inconnue'})`);
    attention = true;
  }
  if (r.resultatsRepris.length > 0) {
    morceaux.push(`${pluriel(r.resultatsRepris.length, 'résultat')} repris de Thomas`);
  }
  return { statut: 'lu', detail: morceaux.length > 0 ? morceaux.join(' · ') : 'Rien de nouveau.', attention };
}

/** Phrase de bilan, en tête de la liste. */
export function bilanLecture(lignes: LigneLecture[]): string {
  if (lignes.length === 0) return 'Aucun tournoi en cours ni cette semaine.';
  const lus = lignes.filter((l) => l.statut === 'lu').length;
  const aRegarder = lignes.filter((l) => l.attention).length;
  const base = `${lus} tournoi${lus > 1 ? 's' : ''} lu${lus > 1 ? 's' : ''} sur ${lignes.length}`;
  return aRegarder > 0 ? `${base} · ${pluriel(aRegarder, 'point')} à regarder` : base;
}
