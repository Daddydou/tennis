// Télécharge l'archive des résultats de Jeff Sackmann (ATP + WTA, tous niveaux) depuis
// Hugging Face (Aneeshers/tennis-sackmann-archive, CC BY-NC-SA 4.0 — usage non commercial,
// attribution : Jeff Sackmann, github.com/JeffSackmann). Le dépôt GitHub d'origine n'existe plus.
//
//   node recherche/elo-maison/telecharger.mjs [dossier] [annéeDébut]
//
// Par défaut : C:\Users\lolor\Projets\_donnees\sackmann, à partir de 1990. Les fichiers déjà
// présents (même taille) ne sont pas re-téléchargés. Données hors dépôt Git (volumineuses).
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DOSSIER = process.argv[2] ?? 'C:\\Users\\lolor\\Projets\\_donnees\\sackmann';
const DEBUT = Number(process.argv[3] ?? 1990);
const BASE = 'https://huggingface.co/datasets/Aneeshers/tennis-sackmann-archive';

const voulu = (chemin) => {
  const m = chemin.match(/_(\d{4})\.csv$/);
  if (chemin.endsWith('_players.csv')) return true;
  if (!m) return false;
  return Number(m[1]) >= DEBUT && /matches(_qual_chall|_futures|_qual_itf)?_\d{4}\.csv$/.test(chemin);
};

let n = 0;
for (const circuit of ['atp', 'wta']) {
  mkdirSync(join(DOSSIER, circuit), { recursive: true });
  const liste = await (await fetch(`${BASE.replace('/datasets/', '/api/datasets/')}/tree/main/${circuit}`)).json();
  for (const f of liste.filter((x) => x.type === 'file' && voulu(x.path))) {
    const cible = join(DOSSIER, f.path);
    if (existsSync(cible) && statSync(cible).size === f.size) continue;
    const res = await fetch(`${BASE}/resolve/main/${f.path}`);
    if (!res.ok) throw new Error(`${f.path} : HTTP ${res.status}`);
    writeFileSync(cible, Buffer.from(await res.arrayBuffer()));
    n++;
    console.log(`${f.path} (${Math.round(f.size / 1024)} Ko)`);
  }
}
console.log(`Terminé : ${n} fichier(s) téléchargé(s) dans ${DOSSIER}`);
