// Premier passage : chargement, statistiques, Elo FiveThirtyEight brut, par période.
import { chargerHistorique } from './donnees.mts';
import { mesurer, PARAMS_538, rejouer } from './modele.mts';

const t0 = Date.now();
const h = chargerHistorique({ debut: 1990 });
console.log(`chargé en ${((Date.now() - t0) / 1000).toFixed(1)} s : ${h.matchs.length} matchs, ${h.joueurs.size} joueurs`);
console.log(h.stats);
const parNiveau: Record<string, number> = {};
for (const m of h.matchs) parNiveau[`${m.tour}-${m.niveau}`] = (parNiveau[`${m.tour}-${m.niveau}`] ?? 0) + 1;
console.log(parNiveau);

const t1 = Date.now();
const r = rejouer(h.matchs, PARAMS_538);
console.log(`rejoué en ${((Date.now() - t1) / 1000).toFixed(2)} s`);
const circuit = new Set(['G', 'M', 'A', 'F']);
for (const [debut, fin] of [['2008', '2017'], ['2018', '2021'], ['2022', '2026']]) {
  for (const tour of ['ATP', 'WTA']) {
    const m = mesurer(r.p, (i) => {
      const x = h.matchs[i];
      return x.tour === tour && circuit.has(x.niveau) && x.date >= `${debut}0101` && x.date <= `${fin}1231`;
    });
    console.log(`${tour} ${debut}-${fin} : n=${m.n} logloss=${m.logLoss.toFixed(4)} brier=${m.brier.toFixed(4)} exact=${(m.exactitude * 100).toFixed(1)} %`);
  }
}
