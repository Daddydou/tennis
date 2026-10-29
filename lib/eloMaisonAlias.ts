/**
 * ELO MAISON — ALIAS D'IDENTITÉ (module PUR : ni Next, ni Supabase).
 *
 * Problème. Le rapprochement par le nom ne suffit pas : l'archive écrit parfois
 * un même joueur de plusieurs façons (« Xin Yu Wang » / « Xinyu Wang », « Ye Xin Ma »
 * / « Yexin Ma », « Coleman Wong » / « Chak Lam Coleman Wong »), et le passage
 * quotidien a pu recréer une ligne neuve (`WTA:m47152`, 19 matchs) à côté de la
 * ligne historique (`WTA:s216133`, 444 matchs). Résultat : des homonymes « ambigus »
 * (Elo remplacé par le défaut du circuit) ou, pire, la mauvaise ligne.
 *
 * Remède NON DESTRUCTIF. La table `tn_elo_maison_alias` dit, pour un joueur de l'app
 * (`tn_players.id`), quelle ligne de `tn_elo_maison` (`ta_slug`) est la sienne. Elle
 * passe avant le rapprochement par le nom. Aucune ligne d'Elo n'est supprimée ni fusionnée.
 *
 * Trouver les joueurs à traiter : `npm run verify:elo-inconnus`.
 */

/** Une ligne de `tn_elo_maison_alias`, réduite à ce que la résolution lit. */
export interface LigneAlias {
  player_id: string;
  ta_slug: string;
}

/**
 * Relie chaque joueur de l'app à sa ligne d'Elo. Un alias qui désigne une ligne
 * absente de l'index (supprimée, autre circuit) est ignoré : le rapprochement par
 * le nom prend alors le relais, comme s'il n'y avait pas d'alias.
 */
export function indexerAlias<T extends { ta_slug: string }>(lignes: T[], alias: LigneAlias[]): Map<string, T> {
  const parSlug = new Map(lignes.map((l) => [l.ta_slug, l]));
  const out = new Map<string, T>();
  for (const a of alias) {
    const ligne = parSlug.get(a.ta_slug);
    if (ligne) out.set(a.player_id, ligne);
  }
  return out;
}
