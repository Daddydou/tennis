import { badgeNeutre, carte, noteInfo } from '@/app/ui';
import type { PronosticStocke } from '@/db/mastersPronostic';
import { MAX_PRONOSTIC, pointsPronostic, type PronosticMasters } from '@/lib/masters';
import { classerTournoi, reelDepuisVue } from '@/lib/mastersPronostic';
import type { VueMasters } from '@/lib/mastersVue';
import EditeurPronostic from './EditeurPronostic';

/**
 * Pronostics des Masters et classement du tournoi : points du pronostic (qualifiée 4, place exacte 2, finaliste 8,
 * championne 16 ; 64 au maximum) + points des picks. Le pronostic se saisit jusqu'au premier match.
 */

export interface ParticipantMasters {
  /** null = moi. */
  id: string | null;
  nom: string;
}

const pts = (x: number) => String(x);

function Resume({ p, noms }: { p: PronosticMasters; noms: Record<string, string> }) {
  const nom = (id: string) => noms[id] ?? id;
  return (
    <div className="space-y-0.5 text-sm">
      <p>
        <span className="text-zinc-600">Poule A :</span> {p.classementA.map(nom).join(' > ')}
      </p>
      <p>
        <span className="text-zinc-600">Poule B :</span> {p.classementB.map(nom).join(' > ')}
      </p>
      <p>
        <span className="text-zinc-600">Vainqueurs des demies :</span> {p.vainqueursDemis.map(nom).join(' et ')}
      </p>
      <p>
        <span className="text-zinc-600">Championne :</span> <span className="font-semibold">{nom(p.champion)}</span>
      </p>
    </div>
  );
}

export default function PronosticsMasters({
  tournamentId,
  vue,
  poules,
  noms,
  participants,
  pronostics,
  picksPar,
  propose,
  ferme,
}: {
  tournamentId: string;
  vue: VueMasters;
  poules: { A: string[]; B: string[] };
  noms: Record<string, string>;
  participants: ParticipantMasters[];
  pronostics: PronosticStocke[];
  /** Points des picks par participant : clé = id du participant, ou « moi ». */
  picksPar: Record<string, number>;
  /** Pronostic proposé par la simulation, pour pré-remplir le mien. */
  propose: PronosticMasters | null;
  ferme: boolean;
}) {
  if (poules.A.length !== 4 || poules.B.length !== 4) return null;
  const reel = reelDepuisVue(vue);
  const cle = (id: string | null) => id ?? 'moi';
  const stocke = (id: string | null) => pronostics.find((x) => x.participantId === id)?.pronostic ?? null;
  const classement = classerTournoi(
    participants.map((p) => ({ nom: p.nom, pronostic: stocke(p.id), picks: picksPar[cle(p.id)] ?? 0 })),
    reel,
  );
  const parDefaut: PronosticMasters = { classementA: poules.A, classementB: poules.B, vainqueursDemis: [poules.A[0], poules.B[0]], champion: poules.A[0] };

  return (
    <section className={`${carte} space-y-3 p-4`} data-testid="pronostics-masters">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-base font-semibold">Pronostics et classement</h2>
        <span className="text-xs text-zinc-600">{ferme ? 'Pronostics fermés (premier match lancé)' : 'Pronostics ouverts jusqu\'au premier match'}</span>
      </header>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="w-6 py-1 font-normal">#</th>
            <th className="py-1 font-normal">Participant</th>
            <th className="py-1 text-right font-normal">Pronostic</th>
            <th className="py-1 text-right font-normal">Picks</th>
            <th className="py-1 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {classement.map((l) => (
            <tr key={l.nom} className="border-t border-zinc-100">
              <td className="py-1.5 text-zinc-500">{l.rang}</td>
              <td className="py-1.5 font-medium text-zinc-900">{l.nom}</td>
              <td className="py-1.5 text-right font-mono text-xs">{l.pronostic ? `${pts(l.pronostic.total)} / ${MAX_PRONOSTIC}` : '—'}</td>
              <td className="py-1.5 text-right font-mono text-xs">{pts(l.picks)}</td>
              <td className="py-1.5 text-right font-mono text-sm font-semibold">{pts(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-2">
        {participants.map((part) => {
          const p = stocke(part.id);
          const points = p ? pointsPronostic(p, reel) : null;
          const initial = p ?? (part.id === null && propose ? propose : parDefaut);
          return (
            <details key={cle(part.id)} className="rounded-xl bg-zinc-50 p-3">
              <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 text-sm font-medium text-zinc-900">
                {part.nom}
                <span className={badgeNeutre}>{p ? 'pronostic saisi' : 'pas de pronostic'}</span>
                {points && (
                  <span className="text-xs font-normal text-zinc-600">
                    {pts(points.total)} pts · encore {pts(points.maxRestant - points.total)} possibles
                  </span>
                )}
              </summary>
              <div className="mt-2 space-y-3">
                {p && <Resume p={p} noms={noms} />}
                {points && (
                  <p className="text-xs text-zinc-600">
                    Qualifiées {pts(points.qualifies)} + places exactes {pts(points.places)} + finalistes {pts(points.finalistes)} + championne {pts(points.champion)}.
                  </p>
                )}
                {!ferme ? (
                  <>
                    <p className="text-xs font-medium text-zinc-700">{p ? 'Modifier ce pronostic' : part.id === null && propose ? 'Pré-rempli avec le pronostic proposé ci-dessus' : 'Saisir un pronostic'}</p>
                    <EditeurPronostic tournamentId={tournamentId} participantId={part.id} poules={poules} noms={noms} initial={initial} />
                  </>
                ) : !p ? (
                  <p className={noteInfo}>Pas de pronostic enregistré : il est fermé depuis le premier match.</p>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
      <p className="text-xs text-zinc-600">
        Qualifiée trouvée 4 pts (dans ton top 2), place exacte 2 pts, finaliste trouvée 8 pts (quel que soit son parcours), championne 16 pts : {MAX_PRONOSTIC} au maximum.
        Les places d&apos;une poule ne comptent qu&apos;une fois la poule terminée et son classement sans égalité. Les pronostics de Thomas et de Laki se saisissent à la
        main tant que l&apos;API de Thomas ne les donne pas.
      </p>
    </section>
  );
}
