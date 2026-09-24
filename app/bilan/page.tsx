import Link from 'next/link';
import { carte, pilleSelecteur } from '@/app/ui';
import { LIBELLE_CATEGORIE_COURT } from '@/lib/calendrier';
import type { BilanElo, ProgressionElo } from '@/lib/bilanSaison';
import { chargerBilan } from './donnees';

export const dynamic = 'force-dynamic';

/**
 * BILAN DE SAISON — généré à chaque affichage à partir de ce qui est en
 * base : aucun stockage, aucune saisie. Descriptif seulement : rien n'est
 * réinjecté dans le moteur (cf. mémoire « collecter oui, ajuster non »).
 */

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, j] = iso.slice(0, 10).split('-');
  return `${Number(j)}/${m}/${a.slice(2)}`;
}

const signe = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n)}`;

function ListeProgressions({ lignes }: { lignes: ProgressionElo[] }) {
  return (
    <ol className="space-y-0.5 text-sm">
      {lignes.map((p) => (
        <li key={p.slug} className="flex justify-between gap-2">
          <span className="truncate">{p.nom}</span>
          <span className="shrink-0 tabular-nums text-zinc-500">
            {Math.round(p.depart)} → {Math.round(p.arrivee)}{' '}
            <span className={p.delta >= 0 ? 'font-medium text-emerald-600' : 'font-medium text-red-600'}>
              {signe(p.delta)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function BlocElo({ tour, elo }: { tour: string; elo: BilanElo }) {
  if (elo.progressions.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        {tour} : pas assez de relevés archivés cette saison pour mesurer une progression.
      </p>
    );
  }
  const hausses = elo.progressions.slice(0, 5);
  const baisses = [...elo.progressions].reverse().slice(0, 5);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{tour}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-zinc-500">Meilleures progressions</p>
          <ListeProgressions lignes={hausses} />
        </div>
        <div>
          <p className="mb-1 text-xs text-zinc-500">Plus fortes baisses</p>
          <ListeProgressions lignes={baisses} />
        </div>
      </div>
      <p className="text-[11px] text-zinc-400">
        {elo.progressions.length} joueurs de nos tournois mesurés sur {elo.nbReleves} relevés, du{' '}
        {formatDate(elo.du)} au {formatDate(elo.au)}.
      </p>
    </div>
  );
}

export default async function BilanPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const { annee: anneeParam } = await searchParams;
  const bilan = await chargerBilan(anneeParam ? Number(anneeParam) : null);
  const nomTournoi = new Map(bilan.tournois.map((t) => [t.id, t.name]));
  const nomStock = new Map(bilan.stocks.map((s) => [s.id, s.nom]));
  const termines = bilan.tournois.filter((t) => t.status === 'completed').length;
  const parCategorie = new Map<string, number>();
  for (const t of bilan.tournois) {
    const c = LIBELLE_CATEGORIE_COURT[t.category ?? ''] ?? 'Autre';
    parCategorie.set(c, (parCategorie.get(c) ?? 0) + 1);
  }
  const classement = [...bilan.classement].sort((a, b) => b.total - a.total);

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Bilan de la saison {bilan.annee}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Généré à partir des tournois importés : {bilan.tournois.length} tournoi(s), dont{' '}
          {termines} terminé(s)
          {parCategorie.size > 0 &&
            ` — ${[...parCategorie].map(([c, n]) => `${n} ${c}`).join(', ')}`}
          .
        </p>
        {bilan.annees.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {bilan.annees.map((a) => (
              <Link key={a} href={`/bilan?annee=${a}`} className={pilleSelecteur(a === bilan.annee)}>
                {a}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Classement du groupe ── */}
      <div className={`space-y-2 p-3 ${carte}`}>
        <h2 className="text-sm font-semibold">Classement du groupe</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 pr-3 font-medium">Joueur</th>
                <th className="py-1 pr-3 text-right font-medium">Picks</th>
                <th className="py-1 pr-3 text-right font-medium">Bracket</th>
                <th className="py-1 pr-3 text-right font-medium">Total</th>
                <th className="py-1 font-medium">Meilleur tournoi</th>
              </tr>
            </thead>
            <tbody>
              {classement.map((s, i) => (
                <tr key={s.stockId ?? 'moi'} className="border-t border-zinc-100">
                  <td className="py-1.5 pr-3 font-medium">
                    {i === 0 && s.total > 0 ? '🏆 ' : ''}
                    {nomStock.get(s.stockId) ?? '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{s.picks}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{s.bracket}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{s.total}</td>
                  <td className="py-1.5 text-xs text-zinc-500">
                    {s.meilleur
                      ? `${nomTournoi.get(s.meilleur.tournoiId) ?? '—'} (${s.meilleur.points} pts)`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-zinc-400">
          Mêmes points que le Dashboard de chaque tournoi (picks validés + Bracket sur
          les matchs déjà joués).
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* ── Mes joueurs les plus rentables ── */}
        <div className={`space-y-2 p-3 ${carte}`}>
          <h2 className="text-sm font-semibold">Mes picks les plus rentables</h2>
          {bilan.rentables.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucun point de pick cette saison.</p>
          ) : (
            <ol className="space-y-0.5 text-sm">
              {bilan.rentables.map((j) => (
                <li key={j.nom} className="flex justify-between gap-2">
                  <span className="truncate">{j.nom}</span>
                  <span className="shrink-0 tabular-nums text-zinc-500">
                    {j.points} pts · {j.fois} pick{j.fois > 1 ? 's' : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── Fantasy ── */}
        <div className={`space-y-2 p-3 ${carte}`}>
          <h2 className="text-sm font-semibold">Fantasy</h2>
          {bilan.fantasy.termines === 0 ? (
            <p className="text-sm text-zinc-500">Aucun tournoi terminé dans l&apos;historique Fantasy.</p>
          ) : (
            <div className="space-y-1 text-sm">
              <p>
                <span className="font-semibold tabular-nums">{Math.round(bilan.fantasy.reel)}</span> pts
                réels pour <span className="tabular-nums">{Math.round(bilan.fantasy.predit)}</span> espérés,
                sur {bilan.fantasy.termines} tournoi(s) terminé(s).
              </p>
              {bilan.fantasy.meilleur && (
                <p className="text-zinc-500">
                  Meilleur : {nomTournoi.get(bilan.fantasy.meilleur.tournoiId) ?? '—'} (
                  {Math.round(bilan.fantasy.meilleur.reel)} pts)
                </p>
              )}
              <p className="text-[11px] text-zinc-400">
                Équipe optimale figée au tirage — détail dans{' '}
                <Link href="/fantasy" className="underline">
                  l&apos;historique Fantasy
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Progression Elo ── */}
      <div className={`space-y-3 p-3 ${carte}`}>
        <h2 className="text-sm font-semibold">Progression Elo</h2>
        <BlocElo tour="ATP" elo={bilan.elo.ATP} />
        <BlocElo tour="WTA" elo={bilan.elo.WTA} />
        <p className="text-[11px] text-amber-700">
          L&apos;archive des Elo ne remonte qu&apos;à sa mise en place (fin juillet
          2026) : la « progression » ne couvre que la période indiquée, pas toute la
          saison.
        </p>
      </div>

      {/* ── Joueurs les plus victorieux ── */}
      <div className={`space-y-2 p-3 ${carte}`}>
        <h2 className="text-sm font-semibold">Le plus de victoires dans nos tournois</h2>
        {bilan.victorieux.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun match décidé.</p>
        ) : (
          <ol className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
            {bilan.victorieux.map((j, i) => (
              <li key={j.nom} className="flex justify-between gap-2">
                <span className="truncate">
                  <span className="text-zinc-400">{i + 1}.</span> {j.nom}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-500">{j.victoires} v.</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-[11px] text-zinc-400">Byes exclus ; w.o. et abandons comptés.</p>
      </div>
    </div>
  );
}
