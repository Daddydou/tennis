import Link from 'next/link';
import { boutonPrimaire, champTexte, pilleSelecteur } from '@/app/ui';
import type { Tour } from '@/lib/types';

/**
 * Choix du circuit puis des deux joueurs. Formulaire GET ordinaire : l'état
 * vit dans l'URL (partageable, rechargeable) et l'écran marche sans
 * JavaScript. Changer de circuit repart d'une sélection vide — un
 * face-à-face ATP/WTA n'a pas de sens.
 */
export default function SelecteurJoueurs({
  tour,
  joueurs,
  idA,
  idB,
}: {
  tour: Tour;
  joueurs: { id: string; name: string }[];
  idA: string | null;
  idB: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(['ATP', 'WTA'] as const).map((t) => (
          <Link key={t} href={`/face-a-face?tour=${t}`} className={pilleSelecteur(t === tour)}>
            {t}
          </Link>
        ))}
      </div>
      <form method="get" action="/face-a-face" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tour" value={tour} />
        {(
          [
            ['a', 'Joueur 1', idA],
            ['b', 'Joueur 2', idB],
          ] as const
        ).map(([nom, libelle, valeur]) => (
          <label key={nom} className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-zinc-500">
            {libelle}
            <select name={nom} defaultValue={valeur ?? ''} className={champTexte} required>
              <option value="" disabled>
                Choisir…
              </option>
              {joueurs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="submit" className={boutonPrimaire}>
          Comparer
        </button>
      </form>
    </div>
  );
}
