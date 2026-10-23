// Contribution de chaque brique : on retire UNE brique aux paramètres retenus et on mesure la
// perte sur la VALIDATION 2018-2021 (circuit principal, ATP + WTA). Pas de regard sur le test.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chargerHistorique } from './donnees.mts';
import { mesurer, PARAMS_538, rejouer, type Params } from './modele.mts';

const DOSSIER = join(import.meta.dirname, 'resultats');
const p: Params = JSON.parse(readFileSync(join(DOSSIER, 'params-optimaux.json'), 'utf8'));
const h = chargerHistorique({ debut: 1990 });
const circuit = new Set(['G', 'M', 'A', 'F']);
const val = (i: number) => circuit.has(h.matchs[i].niveau) && h.matchs[i].date >= '20180101' && h.matchs[i].date <= '20211231';
const ll = (q: Params) => mesurer(rejouer(h.matchs, q).p, val).logLoss;

const ref = ll(p);
const variantes: [string, Params][] = [
  ['sans conversion 3 sets gagnants (bo5)', { ...p, bo5: false }],
  ['sans marge de victoire', { ...p, marge: 0 }],
  ['K identique pour tous les niveaux', { ...p, niveau: { G: 1, M: 1, A: 1, F: 1, C: 1, S: 1, Q: 1, D: 1 } }],
  ['abandons comptés comme un match normal', { ...p, abandon: 1 }],
  ['poids surface 0,5 (au lieu de 0,40)', { ...p, wSurface: 0.5 }],
  ['poids surface 0,6 (réglage actuel de l’app)', { ...p, wSurface: 0.6 }],
  ['sans plancher de K', { ...p, kMin: 0 }],
  ['échelle 400 (au lieu de 507)', { ...p, echelle: 400 }],
  ['sans les Futures / ITF (niveau S ignoré)', { ...p, niveau: { ...p.niveau, S: 0 } }],
  ['sans les Challengers / qualifs', { ...p, niveau: { ...p.niveau, C: 0, Q: 0 } }],
  ['FiveThirtyEight (paramètres publiés)', PARAMS_538],
];
const lignes = [`Référence (paramètres retenus) : log-loss validation ${ref.toFixed(5)}`];
for (const [nom, q] of variantes) {
  const v = ll(q);
  lignes.push(`${nom.padEnd(48)} ${v.toFixed(5)}  (${v - ref >= 0 ? '+' : ''}${(v - ref).toFixed(5)})`);
}
console.log(lignes.join('\n'));
writeFileSync(join(DOSSIER, 'ablation.txt'), lignes.join('\n'));
