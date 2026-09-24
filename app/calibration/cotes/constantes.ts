/** Poids de l'Elo dans le mélange. 50/50 au départ, comme demandé. */
export const POIDS_ELO = 0.5;

/**
 * Second mélange, qui pèse davantage le marché que l'Elo. Il ne remplace pas le
 * 50/50 : les deux sont mesurés côte à côte, pour voir lequel calibre le mieux.
 */
export const POIDS_ELO_MARCHE = 0.3;

/** « Blend 30/70 » — poids Elo d'abord, poids cotes ensuite. */
export const libelleBlend = (poidsElo: number) =>
  `Blend ${Math.round(poidsElo * 100)}/${Math.round((1 - poidsElo) * 100)}`;

export const pct = (p: number | null) =>
  p === null || !Number.isFinite(p) ? '—' : `${(p * 100).toFixed(1)} %`;
