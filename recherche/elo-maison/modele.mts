/**
 * ELO MAISON — moteur de la recherche = moteur de production (lib/eloMaison.ts), réexporté
 * sous les noms des scripts, plus les mesures (log-loss, Brier, calibration).
 */
export {
  PARAMS_538,
  probaSet,
  versBo5,
  noteDepart,
  noteEffective,
  probabilite,
  rejouer,
  type ParamsElo as Params,
  type NoteElo as Note,
} from '../../lib/eloMaison.ts';

export interface Mesure {
  n: number;
  logLoss: number;
  brier: number;
  exactitude: number;
}

/** Log-loss, Brier, exactitude sur les matchs sélectionnés (p = probabilité du vainqueur réel). */
export function mesurer(p: Float64Array, garder: (i: number) => boolean): Mesure {
  let n = 0;
  let ll = 0;
  let br = 0;
  let ok = 0;
  for (let i = 0; i < p.length; i++) {
    if (!garder(i)) continue;
    const q = Math.min(1 - 1e-9, Math.max(1e-9, p[i]));
    n++;
    ll -= Math.log(q);
    br += (1 - q) * (1 - q);
    if (q > 0.5) ok++;
    else if (q === 0.5) ok += 0.5;
  }
  return { n, logLoss: ll / n, brier: br / n, exactitude: ok / n };
}

/** Courbe de calibration : par tranche de probabilité du favori, proportion réelle de victoires. */
export function calibration(p: Float64Array, garder: (i: number) => boolean, tranches = 10) {
  const somme = new Array(tranches).fill(0);
  const gagne = new Array(tranches).fill(0);
  const nb = new Array(tranches).fill(0);
  for (let i = 0; i < p.length; i++) {
    if (!garder(i)) continue;
    const fav = p[i] >= 0.5 ? p[i] : 1 - p[i];
    const favGagne = p[i] >= 0.5 ? 1 : 0;
    const t = Math.min(tranches - 1, Math.floor((fav - 0.5) * 2 * tranches));
    somme[t] += fav;
    gagne[t] += favGagne;
    nb[t]++;
  }
  return nb.map((n, t) => ({
    tranche: `${(50 + (t * 50) / tranches).toFixed(0)}-${(50 + ((t + 1) * 50) / tranches).toFixed(0)} %`,
    n,
    predit: n ? somme[t] / n : null,
    reel: n ? gagne[t] / n : null,
  }));
}
