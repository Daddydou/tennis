import { cleDeNom, compterSources, type ElosResolus } from '@/db/elo';
import type { PlayerRow } from '@/db/queries';

/**
 * Provenance des Elo du tableau. Un joueur fort en « maison » ou en
 * « défaut » signale une correspondance de nom à corriger.
 */
export default function ProvenanceElo({
  elos,
  playerRows,
  tour,
}: {
  elos: Record<string, ElosResolus>;
  playerRows: PlayerRow[];
  tour: string;
}) {
  // Répartition des sources sur TOUS les joueurs du tournoi (pas seulement les
  // survivants du tour affiché) : c'est le tableau entier qu'on veut contrôler.
  // Propriété du tournoi, pas du stock affiché.
  const sources = compterSources(elos);
  const tourTa = tour.toLowerCase();
  const aCompleter = playerRows
    .filter((p) => elos[p.id] && elos[p.id].source !== 'ta')
    .map((p) => {
      const e = elos[p.id];
      return {
        nom: p.name,
        pays: p.country,
        cle: cleDeNom(p.name),
        source: e.source,
        candidats: e.candidats,
        // Un homonyme se tranche en désignant un slug : on donne l'insert prêt
        // à coller, c'est la seule action utile depuis cet écran.
        sql:
          e.candidats.length > 0
            ? `insert into ta_name_exceptions (atp_name_normalized, ta_slug, tour) values ('${cleDeNom(
                p.name,
              )}', '${e.candidats[0].slug}', '${tourTa}');`
            : null,
      };
    })
    .sort(
      (a, b) =>
        Number(b.source === 'ambigu') - Number(a.source === 'ambigu') ||
        a.nom.localeCompare(b.nom),
    );

  return (
    <details className="rounded-2xl bg-white px-3 py-2 text-xs shadow-card">
      <summary className="cursor-pointer text-zinc-600">
        <span className="font-medium text-zinc-900">{sources.ta}</span>{' '}
        joueur(s) sur {sources.total} avec Elo Tennis Abstract,{' '}
        <span className={sources.maison > 0 ? 'font-medium text-amber-600' : ''}>
          {sources.maison}
        </span>{' '}
        en repli maison,{' '}
        <span className={sources.defaut > 0 ? 'font-medium text-red-600' : ''}>{sources.defaut}</span>{' '}
        en défaut,{' '}
        <span className={sources.ambigu > 0 ? 'font-medium text-violet-600' : ''}>{sources.ambigu}</span>{' '}
        ambigu(s)
        {aCompleter.length > 0 && (
          <span className="ml-1 text-zinc-400">— détail</span>
        )}
      </summary>

      {aCompleter.length === 0 ? (
        <p className="mt-2 text-zinc-500">
          Tous les joueurs du tableau ont un Elo Tennis Abstract.
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-zinc-500">
            Sans Elo Tennis Abstract retenu. Beaucoup sont des spécialistes de
            double ou des joueurs inactifs, absents du rapport — pour les
            autres, déclarer la correspondance dans{' '}
            <code className="rounded bg-zinc-100 px-1">ta_name_exceptions</code>.
          </p>

          {/* Les ambigus d'abord : ce sont les seuls réellement actionnables,
              et le seul cas où un Elo faux pourrait passer inaperçu. */}
          {aCompleter
            .filter((j) => j.source === 'ambigu')
            .map((j) => (
              <div key={j.cle} className="space-y-1 rounded-xl bg-violet-50 p-2">
                <p className="text-violet-800">
                  <span className="font-medium">{j.nom}</span>
                  {j.pays ? ` (${j.pays})` : ''} — {j.candidats.length}{' '}
                  homonymes sous la clé <code>{j.cle}</code>, aucun choisi :
                </p>
                <ul className="ml-4 list-disc text-violet-800">
                  {j.candidats.map((c) => (
                    <li key={c.slug}>
                      {c.nom} — <code>{c.slug}</code>
                      {c.elo != null && ` — Elo ${Math.round(c.elo)}`}
                    </li>
                  ))}
                </ul>
                {j.sql && (
                  <p className="text-[11px] text-violet-700">
                    Trancher (remplacer le slug si besoin) :{' '}
                    <code className="rounded bg-white/60 px-1">{j.sql}</code>
                  </p>
                )}
              </div>
            ))}

          <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {aCompleter
              .filter((j) => j.source !== 'ambigu')
              .map((j) => (
                <li key={j.cle} className="flex items-baseline gap-2">
                  <span className={j.source === 'defaut' ? 'text-red-600' : 'text-amber-600'}>
                    {j.source === 'defaut' ? 'défaut' : 'maison'}
                  </span>
                  <span className="text-zinc-700">{j.nom}</span>
                  <code className="text-zinc-400">{j.cle}</code>
                </li>
              ))}
          </ul>
        </div>
      )}
    </details>
  );
}
