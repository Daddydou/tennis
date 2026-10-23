/**
 * ELO MAISON — réglage des paramètres.
 *
 * Protocole (aucun regard sur la période de test) :
 *   - ENTRAÎNEMENT 2008-2017 : on choisit les paramètres qui minimisent la log-loss moyenne
 *     des matchs du circuit principal (tableau final, ATP + WTA) ;
 *   - VALIDATION 2018-2021 : sert à vérifier que le gain tient hors de l'entraînement, et à
 *     départager les variantes ;
 *   - TEST 2022 → aujourd'hui : mesuré UNE fois, à la fin (evaluer.mts).
 * Les notes sont toujours calculées en continu depuis 1990 (tous niveaux) ; seules les
 * PRÉDICTIONS des périodes ci-dessus entrent dans les scores.
 *
 * Méthode : descente coordonnée — on fait varier un paramètre à la fois autour de la
 * meilleure valeur connue, on garde le meilleur, on recommence jusqu'à stabilité.
 *
 *   node --max-old-space-size=6144 recherche/elo-maison/optimiser.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chargerHistorique } from './donnees.mts';
import { mesurer, PARAMS_538, rejouer, type Params } from './modele.mts';

const DOSSIER = join(import.meta.dirname, 'resultats');
mkdirSync(DOSSIER, { recursive: true });

const h = chargerHistorique({ debut: 1990 });
const circuit = new Set(['G', 'M', 'A', 'F']);
const dans = (debut: string, fin: string) => {
  const idx: number[] = [];
  h.matchs.forEach((m, i) => {
    if (circuit.has(m.niveau) && m.date >= `${debut}0101` && m.date <= `${fin}1231`) idx.push(i);
  });
  const set = new Uint8Array(h.matchs.length);
  for (const i of idx) set[i] = 1;
  return (i: number) => set[i] === 1;
};
const ENTRAINEMENT = dans('2008', '2017');
const VALIDATION = dans('2018', '2021');

const score = (p: Params, filtre = ENTRAINEMENT) => mesurer(rejouer(h.matchs, p).p, filtre).logLoss;

type Reglage = { cle: string; valeurs: (p: Params) => Params[] };
const num = (cle: keyof Params, min: number, max: number, facteurs = [0.6, 0.8, 0.9, 1.1, 1.25, 1.6]): Reglage => ({
  cle,
  valeurs: (p) => {
    const v = p[cle] as number;
    const base = v === 0 ? [min + (max - min) * 0.1, min + (max - min) * 0.3] : facteurs.map((f) => v * f);
    return [...new Set(base.map((x) => Math.min(max, Math.max(min, x))))].map((x) => ({ ...p, [cle]: x }));
  },
});
const niv = (n: keyof Params['niveau']): Reglage => ({
  cle: `niveau.${n}`,
  valeurs: (p) =>
    [0.6, 0.8, 0.9, 1.1, 1.25, 1.5].map((f) => ({ ...p, niveau: { ...p.niveau, [n]: Math.min(2.5, Math.max(0.2, p.niveau[n] * f)) } })),
});
const bool = (cle: 'bo5' | 'moquetteAvecDur'): Reglage => ({ cle, valeurs: (p) => [{ ...p, [cle]: !p[cle] }] });
const choix = (cle: keyof Params, liste: number[]): Reglage => ({ cle, valeurs: (p) => liste.map((x) => ({ ...p, [cle]: x })) });

const REGLAGES: Reglage[] = [
  num('k0', 50, 800),
  num('kDecal', 0.5, 100),
  num('kForme', 0.05, 1),
  num('kMin', 0, 60),
  num('wSurface', 0, 1, [0.5, 0.7, 0.85, 1.15, 1.3, 1.5]),
  niv('G'), niv('M'), niv('F'), niv('C'), niv('S'), niv('Q'), niv('D'),
  num('abandon', 0, 1.5, [0, 0.5, 0.75, 1.25]),
  num('marge', 0, 3),
  choix('retourJours', [60, 90, 120, 180, 270, 100000]),
  num('retourK', 1, 4, [1.2, 1.5, 2]),
  num('initPente', 0, 400),
  bool('bo5'),
  bool('moquetteAvecDur'),
  { cle: 'croise', valeurs: (p) => [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5].map((x) => ({ ...p, croise: x })) },
  { cle: 'wSurfaceN', valeurs: (p) => [0, 2, 5, 10, 20, 40].map((x) => ({ ...p, wSurfaceN: x })) },
  num('echelle', 250, 700, [0.85, 0.95, 1.05, 1.15]),
];

// `--reprendre` : repartir des paramètres déjà trouvés (resultats/params-optimaux.json).
let meilleur: Params = process.argv.includes('--reprendre')
  ? JSON.parse(readFileSync(join(DOSSIER, 'params-optimaux.json'), 'utf8'))
  : { ...PARAMS_538, niveau: { ...PARAMS_538.niveau } };
let meilleurScore = score(meilleur);
const journal: string[] = [];
const noter = (t: string) => {
  journal.push(t);
  console.log(t);
  writeFileSync(join(DOSSIER, process.argv.includes('--reprendre') ? 'optimisation-2.log' : 'optimisation.log'), journal.join('\n'));
};
let meilleurVal = score(meilleur, VALIDATION);
noter(`Départ : log-loss entraînement ${meilleurScore.toFixed(5)}, validation ${meilleurVal.toFixed(5)}`);
writeFileSync(join(DOSSIER, 'params-optimaux.json'), JSON.stringify(meilleur, null, 2));

for (let passe = 1; passe <= 6; passe++) {
  const avant = meilleurScore;
  for (const r of REGLAGES) {
    for (const cand of r.valeurs(meilleur)) {
      const s = score(cand);
      if (s < meilleurScore - 1e-6) {
        meilleurScore = s;
        meilleur = cand;
        const v = r.cle.startsWith('niveau.') ? cand.niveau[r.cle.slice(7) as keyof Params['niveau']] : cand[r.cle as keyof Params];
        noter(`  passe ${passe} · ${r.cle} = ${typeof v === 'number' ? v.toFixed(4) : v} → ${s.toFixed(5)}`);
      }
    }
  }
  const val = score(meilleur, VALIDATION);
  noter(`Fin de passe ${passe} : entraînement ${meilleurScore.toFixed(5)} · validation ${val.toFixed(5)}`);
  // Arrêt précoce : on ne garde que les paramètres qui améliorent AUSSI la validation (sinon
  // on apprend le bruit de 2008-2017). Ce sont eux qui sont écrits dans params-optimaux.json.
  if (val < meilleurVal - 1e-6) {
    meilleurVal = val;
    writeFileSync(join(DOSSIER, 'params-optimaux.json'), JSON.stringify(meilleur, null, 2));
    noter(`  → retenus (meilleure validation jusqu'ici)`);
  }
  if (avant - meilleurScore < 2e-5) break;
}
noter(`Terminé. Validation retenue : ${meilleurVal.toFixed(5)}`);
