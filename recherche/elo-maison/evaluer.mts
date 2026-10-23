/**
 * ELO MAISON — évaluation finale, hors échantillon.
 *
 * Compare sur les mêmes matchs (circuit principal, tableau final) :
 *   - Elo maison (paramètres de resultats/params-optimaux.json, réglés sur 2008-2017) ;
 *   - Elo FiveThirtyEight (paramètres publiés, sans réglage) ;
 *   - classement seul (logistique sur ln(rang perdant / rang gagnant), ajustée sur 2008-2017).
 * Périodes : validation 2018-2021, TEST 2022 → fin des données.
 *
 *   node --max-old-space-size=6144 recherche/elo-maison/evaluer.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chargerHistorique } from './donnees.mts';
import { calibration, mesurer, PARAMS_538, rejouer, type Params } from './modele.mts';

const DOSSIER = join(import.meta.dirname, 'resultats');
const params: Params = JSON.parse(readFileSync(join(DOSSIER, 'params-optimaux.json'), 'utf8'));
const h = chargerHistorique({ debut: 1990 });
const circuit = new Set(['G', 'M', 'A', 'F']);

const brut = rejouer(h.matchs, params).p;
const fte = rejouer(h.matchs, PARAMS_538).p;

// Recalibrage (Platt) : p' = σ(c · logit p), c ajusté sur la VALIDATION 2018-2021 seulement,
// puis appliqué tel quel au test. c < 1 = l'Elo est trop sûr de lui (constaté sur 2022-2026).
const logit = (p: number) => Math.log(p / (1 - p));
const valIdx = h.matchs.map((m, i) => (circuit.has(m.niveau) && m.date >= '20180101' && m.date <= '20211231' ? i : -1)).filter((i) => i >= 0);
let c = 1;
for (let it = 0; it < 50; it++) {
  let g = 0;
  let hs = 0;
  for (const i of valIdx) {
    const x = logit(Math.min(1 - 1e-9, Math.max(1e-9, brut[i])));
    const p = 1 / (1 + Math.exp(-c * x));
    g += (1 - p) * x;
    hs += p * (1 - p) * x * x;
  }
  c += g / hs;
}
const maison = brut.map((p) => 1 / (1 + Math.exp(-c * logit(Math.min(1 - 1e-9, Math.max(1e-9, p))))));
console.log(`Recalibrage ajusté sur 2018-2021 : c = ${c.toFixed(4)} (équivaut à une échelle de prédiction ${(params.echelle / c).toFixed(0)})`);

// Classement seul : p = 1 / (1 + exp(-a · ln(rangPerdant / rangGagnant))), a ajusté (log-loss) sur 2008-2017.
const lr = (i: number) => {
  const m = h.matchs[i];
  return m.rangG && m.rangP ? Math.log(m.rangP / m.rangG) : null;
};
const entr = h.matchs.map((m, i) => (circuit.has(m.niveau) && m.date >= '20080101' && m.date <= '20171231' ? lr(i) : null)).filter((x): x is number => x !== null);
let a = 0.5;
for (let it = 0; it < 60; it++) {
  let g = 0;
  let hs = 0;
  for (const x of entr) {
    const p = 1 / (1 + Math.exp(-a * x));
    g += (1 - p) * x;
    hs += p * (1 - p) * x * x;
  }
  a += g / hs;
}
const rang = new Float64Array(h.matchs.length).fill(NaN);
h.matchs.forEach((_, i) => {
  const x = lr(i);
  if (x !== null) rang[i] = 1 / (1 + Math.exp(-a * x));
});

const rapport: Record<string, unknown> = { params, recalibrage: c, penteClassement: a, periodes: {} };
const lignes: string[] = [];
const periodes: [string, string, string][] = [
  ['validation', '20180101', '20211231'],
  ['TEST', '20220101', '20991231'],
];
for (const [nom, debut, fin] of periodes) {
  for (const tour of ['ATP', 'WTA', 'les deux']) {
    for (const groupe of ['tout', 'Grand Chelem', 'hors GC']) {
      // Seuls les matchs où le classement des deux joueurs est connu : même échantillon pour les 3 méthodes.
      const garder = (i: number) => {
        const m = h.matchs[i];
        if (!circuit.has(m.niveau) || m.date < debut || m.date > fin) return false;
        if (tour !== 'les deux' && m.tour !== tour) return false;
        if (groupe === 'Grand Chelem' && m.niveau !== 'G') return false;
        if (groupe === 'hors GC' && m.niveau === 'G') return false;
        return !Number.isNaN(rang[i]);
      };
      const r = { maison: mesurer(maison, garder), brut: mesurer(brut, garder), fte: mesurer(fte, garder), classement: mesurer(rang, garder) };
      (rapport.periodes as Record<string, unknown>)[`${nom} · ${tour} · ${groupe}`] = r;
      lignes.push(
        `${nom.padEnd(10)} ${tour.padEnd(8)} ${groupe.padEnd(12)} n=${String(r.maison.n).padStart(6)} | ` +
          `log-loss maison ${r.maison.logLoss.toFixed(4)} (brut ${r.brut.logLoss.toFixed(4)}) · 538 ${r.fte.logLoss.toFixed(4)} · classement ${r.classement.logLoss.toFixed(4)} | ` +
          `Brier ${r.maison.brier.toFixed(4)} / ${r.fte.brier.toFixed(4)} / ${r.classement.brier.toFixed(4)} | ` +
          `exact. ${(r.maison.exactitude * 100).toFixed(1)} / ${(r.fte.exactitude * 100).toFixed(1)} / ${(r.classement.exactitude * 100).toFixed(1)} %`,
      );
    }
  }
}
const garderTest = (i: number) => circuit.has(h.matchs[i].niveau) && h.matchs[i].date >= '20220101';
rapport.calibrationTest = { maison: calibration(maison, garderTest), fte: calibration(fte, garderTest) };
writeFileSync(join(DOSSIER, 'evaluation.json'), JSON.stringify(rapport, null, 2));
console.log(lignes.join('\n'));
console.log('\nCalibration TEST (Elo maison) :');
for (const c of (rapport.calibrationTest as { maison: ReturnType<typeof calibration> }).maison) {
  console.log(`  favori ${c.tranche.padEnd(9)} n=${String(c.n).padStart(6)} prédit ${c.predit ? (c.predit * 100).toFixed(1) : '—'} % · réel ${c.reel ? (c.reel * 100).toFixed(1) : '—'} %`);
}
console.log(`\nDonnées jusqu'au ${h.matchs.at(-1)?.date}.`);
