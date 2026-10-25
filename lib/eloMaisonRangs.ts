/**
 * CLASSEMENT ATP DES JOUEURS DE L'ELO MAISON
 *
 * La table `tn_elo_maison` ne stocke pas le classement (colonne `atp_rank`
 * toujours vide) : c'est la table Tennis Abstract (`ta_elo`) qui le publie.
 * Avec SOURCE_ELO=maison, plus aucun joueur n'avait donc de rang, et l'onglet
 * Fantasy (équipe composée par paliers de classement) restait vide.
 *
 * On complète donc les rangs manquants à partir de `ta_elo`, par nom
 * normalisé. Sûr uniquement quand le nom désigne UN SEUL joueur de chaque
 * côté : un homonyme (deux « j smith » côté maison, ou côté Tennis Abstract)
 * reste sans rang plutôt que de recevoir celui d'un autre.
 */

export interface LigneAvecRang {
  ta_name_normalized: string;
  atp_rank: number | null;
}

export interface RangTa {
  ta_name_normalized: string;
  atp_rank: number | string | null;
}

/**
 * Renseigne `atp_rank` des lignes qui n'en ont pas (modifie les lignes en
 * place). Renvoie le nombre de rangs ajoutés.
 */
export function completerRangsParNom(
  lignes: LigneAvecRang[],
  rangsTa: RangTa[],
): number {
  // Rang Tennis Abstract par nom ; `null` = nom porté par plusieurs joueurs.
  const parNomTa = new Map<string, number | null>();
  for (const r of rangsTa) {
    const rang = r.atp_rank === null || r.atp_rank === '' ? NaN : Number(r.atp_rank);
    if (!Number.isFinite(rang)) continue;
    parNomTa.set(
      r.ta_name_normalized,
      parNomTa.has(r.ta_name_normalized) ? null : rang,
    );
  }

  const frequence = new Map<string, number>();
  for (const l of lignes) {
    frequence.set(l.ta_name_normalized, (frequence.get(l.ta_name_normalized) ?? 0) + 1);
  }

  let ajoutes = 0;
  for (const l of lignes) {
    if (l.atp_rank != null) continue;
    if (frequence.get(l.ta_name_normalized) !== 1) continue;
    const rang = parNomTa.get(l.ta_name_normalized);
    if (rang == null) continue;
    l.atp_rank = rang;
    ajoutes++;
  }
  return ajoutes;
}
