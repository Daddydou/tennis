import Link from 'next/link';
import { carte, zoneTactile } from '@/app/ui';
import type { LigneClassementDavis } from '@/lib/davisPronos';
import { MAX_BRACKET } from '@/lib/davis';

type Jeu = 'bracket' | 'pronos' | 'picks';

const JEUX: { cle: Jeu; titre: string; sousTitre: string }[] = [
  { cle: 'bracket', titre: 'Bracket', sousTitre: `la nation (2 / 4 / 8) + le score (1 / 2 / 4), ${MAX_BRACKET} pts au mieux` },
  { cle: 'pronos', titre: 'Pronos des matchs', sousTitre: 'nation 2 pts, score +1, carton plein +2, ×1 / ×2 / ×3 selon le tour' },
  { cle: 'picks', titre: 'Picks par pays', sousTitre: '5 pts + 3 par match d’écart + l’écart de jeux des matchs gagnés' },
];

const valeur = (l: LigneClassementDavis, j: Jeu): number | null => (j === 'bracket' ? l.bracket : j === 'pronos' ? l.pronos : l.picks);

/** Les trois mini-tournois de la Coupe Davis (Bracket, Pronos, Picks) et le classement général. */
export default function DavisClassements({ id, lignes }: { id: string; lignes: LigneClassementDavis[] }) {
  const manquants = (j: Jeu) => lignes.filter((l) => valeur(l, j) === null).map((l) => l.nom);
  return (
    <section className="space-y-4" data-testid="davis-classements">
      <h2 className="text-sm font-semibold">Classement général</h2>
      <div className="space-y-2.5">
        {lignes.map((l, i) => (
          <div key={l.id ?? 'moi'} className={carte}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3 pl-4">
              <span className="w-5 shrink-0 text-sm tabular-nums text-zinc-500">{i + 1}.</span>
              <span className="flex-1 truncate text-base font-semibold">
                {i === 0 && l.total > 0 && '🏆 '}
                {l.nom}
              </span>
              <span className="ml-auto flex shrink-0 items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums leading-none">{l.total}</span>
                <span className="text-xs text-zinc-500">pts</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {JEUX.map((jeu) => {
          const classes = lignes
            .map((l) => ({ l, v: valeur(l, jeu.cle) }))
            .sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
          return (
            <div key={jeu.cle} className={`${carte} space-y-2 p-4`} data-testid={`mini-${jeu.cle}`}>
              <div>
                <h3 className="text-sm font-semibold">{jeu.titre}</h3>
                <p className="text-xs text-zinc-500">{jeu.sousTitre}</p>
              </div>
              <ol className="space-y-1 text-sm">
                {classes.map(({ l, v }, i) => (
                  <li key={l.id ?? 'moi'} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">
                      <span className="mr-1.5 text-xs tabular-nums text-zinc-500">{i + 1}.</span>
                      {l.nom}
                      {jeu.cle === 'bracket' && l.bracketSansScore ? <span className="text-xs text-zinc-500"> (nations seules)</span> : null}
                    </span>
                    {v === null ? <span className="text-zinc-500">—</span> : <span className="font-semibold tabular-nums">{v}</span>}
                  </li>
                ))}
              </ol>
              {jeu.cle !== 'picks' && manquants(jeu.cle).length > 0 && (
                <p className="text-xs text-amber-700">Pas encore importé : {manquants(jeu.cle).join(', ')}.</p>
              )}
            </div>
          );
        })}
      </div>

      {(manquants('bracket').length > 0 || manquants('pronos').length > 0) && (
        <p className="text-sm text-amber-700">
          Le bracket (score) et les pronos des matchs se lisent sur le site de Game Tracker, sans API :{' '}
          <Link href={`/tournoi/${id}/pronostic`} className={`${zoneTactile} font-medium underline underline-offset-2`}>
            les coller dans l’onglet Pronos
          </Link>
          .
        </p>
      )}
    </section>
  );
}
