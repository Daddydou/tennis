import { boutonSecondaire } from '@/app/ui';
import { resoudreParticipant } from '@/lib/bracketImport';
import { correspondanceTours } from '@/lib/bracketExternePont';
import { possibilitesBracket, type Candidat, type PossibilitesParticipant } from '@/lib/bracketPossibilites';
import type { DonneesPossibilites } from '@/db/bracketPossibilites';

/**
 * Panneau « Possibilités des participants » de l'onglet Bracket.
 *
 * Chez Thomas, les pronostics des tours pas encore verrouillés sont cachés. On les encadre à partir de
 * ce qui est visible (cohérence d'un tour à l'autre, barème, joueurs encore en vie) et, si on le lui
 * donne, du « max » affiché chez Thomas (lib/bracketPossibilites.ts). Server component : le champ
 * « max » est un simple formulaire GET, sans JavaScript ni stockage.
 */

function Joueur({ c, avecPart }: { c: Candidat; avecPart: boolean }) {
  return (
    <span className={c.vivant ? 'text-zinc-900' : 'text-zinc-400 line-through'} title={c.vivant ? undefined : 'Éliminé'}>
      {c.nom}
      {avecPart && c.part < 1 ? <span className="text-zinc-500 no-underline"> ({Math.round(c.part * 100)} %)</span> : null}
    </span>
  );
}

function Liste({ candidats, avecPart }: { candidats: Candidat[]; avecPart: boolean }) {
  return (
    <>
      {candidats.map((c, i) => (
        <span key={c.position}>
          {i > 0 ? <span className="text-zinc-400"> ou </span> : null}
          <Joueur c={c} avecPart={avecPart} />
        </span>
      ))}
    </>
  );
}

function Resume({ p }: { p: PossibilitesParticipant }) {
  switch (p.statut) {
    case 'sans_max':
      return (
        <>
          {p.total} tableaux possibles. Saisis le max affiché chez Thomas pour les réduire.
        </>
      );
    case 'avec_max':
      return (
        <>
          {p.compatibles} tableau{p.compatibles > 1 ? 'x' : ''} sur {p.total} collent à ce max.
        </>
      );
    case 'incoherent':
      return <>Aucun tableau ne colle à ce max : valeur périmée ou erronée ?</>;
    case 'trop_grand':
      return <>Trop de pronostics cachés pour les énumérer (un seul tour visible).</>;
    default:
      return <>Rien à déduire : tout est visible, ou pas de pronostic.</>;
  }
}

export default function PossibilitesBracket({
  donnees,
  max,
  rounds,
  participants,
  section,
  vue,
}: {
  donnees: DonneesPossibilites;
  max: Record<string, number>;
  rounds: string[];
  participants: { id: string; name: string }[];
  section?: string;
  vue?: string;
}) {
  const resultat = possibilitesBracket({ ...donnees, max });
  if (resultat.length === 0) return null;

  const tours = correspondanceTours(donnees.drawSize, rounds);
  const libelleTour = (t: number) => (tours.ok ? tours.roundDuTour(t) : `Tour ${t}`);
  const libelle = (pseudo: string) => {
    const r = resoudreParticipant(pseudo, participants);
    if (!r.ok) return pseudo;
    const nom = r.stockId === null ? 'Moi' : (participants.find((x) => x.id === r.stockId)?.name ?? pseudo);
    return nom === pseudo ? nom : `${nom} (${pseudo})`;
  };

  return (
    <details className="rounded-2xl bg-white p-4 shadow-sm">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-zinc-900">
        Possibilités des participants (bracket de Thomas)
      </summary>
      <div className="mt-2 space-y-4 text-sm text-zinc-700">
        <p className="text-xs text-zinc-600">
          Les tours à venir sont cachés chez Thomas. Ici : ce que chacun peut encore avoir pronostiqué, d&apos;après ses tours déjà
          visibles (chaque choix vient de ses choix du tour d&apos;avant), le barème (1, 2, 4, 8, 16, 32 points) et les joueurs encore en
          vie. Ce sont des possibilités, pas des certitudes, sauf quand un seul joueur reste. Joueur barré : éliminé.
        </p>

        <form method="get" className="space-y-2 rounded-xl bg-zinc-50 p-3">
          {section ? <input type="hidden" name="section" value={section} /> : null}
          {vue ? <input type="hidden" name="vue" value={vue} /> : null}
          <p className="text-xs font-medium text-zinc-800">Max affiché chez Thomas (facultatif, pour affiner)</p>
          <div className="flex flex-wrap items-end gap-3">
            {resultat.map((p) => (
              <label key={p.userId} className="flex flex-col gap-1 text-xs text-zinc-600">
                {libelle(p.pseudo)}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  name={`max_${p.pseudo}`}
                  defaultValue={max[p.pseudo] ?? ''}
                  className="min-h-11 w-24 rounded-xl bg-white px-3 text-sm text-zinc-900 shadow-sm"
                />
              </label>
            ))}
            <button type="submit" className={boutonSecondaire}>
              Affiner
            </button>
          </div>
        </form>

        {resultat.map((p) => {
          const parTour = new Map<number, typeof p.cases>();
          for (const c of p.cases) parTour.set(c.tour, [...(parTour.get(c.tour) ?? []), c]);
          const avecPart = p.statut === 'avec_max';
          return (
            <section key={p.userId} className="space-y-1.5 border-t border-zinc-100 pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-sm font-semibold text-titre">{libelle(p.pseudo)}</h3>
                <span className="text-xs text-zinc-600">
                  {p.points} pts{p.bornes ? ` · final possible : ${p.bornes.min === p.bornes.max ? p.bornes.max : `${p.bornes.min} à ${p.bornes.max}`}` : ''}
                </span>
              </div>
              <p className="text-xs text-zinc-600">
                <Resume p={p} />
              </p>
              {p.cases.length > 0 && (
                <>
                  <p className="text-sm">
                    <span className="font-medium text-zinc-900">Champion possible :</span> <Liste candidats={p.champion} avecPart={avecPart} />
                  </p>
                  <ul className="space-y-1 text-xs">
                    {[...parTour.entries()].map(([t, cases]) => (
                      <li key={t}>
                        <span className="font-medium text-zinc-800">{libelleTour(t)}</span>
                        <ul className="ml-4 list-disc">
                          {cases.map((c) => (
                            <li key={c.match}>
                              Match {c.match + 1} : <Liste candidats={c.candidats} avecPart={avecPart} />
                              {c.certain ? <span className="font-medium text-zinc-900"> — certain</span> : null}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })}
      </div>
    </details>
  );
}
