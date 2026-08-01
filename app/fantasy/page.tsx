import Link from 'next/link';
import BackfillButton from './BackfillButton';
import { listerHistorique } from '@/supabase/fantasy';
import { listTournaments } from '@/supabase/queries';
import { LIBELLE_CATEGORIE_COURT } from '@/lib/calendrier';

export const dynamic = 'force-dynamic';

/**
 * HISTORIQUE PRÉDIT / RÉALISÉ
 *
 * Accumule, tournoi après tournoi, l'espérance a priori de l'équipe optimale
 * et ce qu'elle a réellement marqué. C'est la matière première d'une future
 * évaluation de calibration du modèle.
 *
 * ⚠ On REGARDE, on n'ajuste rien. Aucun paramètre (Elo, poids de surface,
 * nombre de simulations) n'est dérivé de ces chiffres. Sur une poignée de
 * tournois, l'écart prédit/réalisé est dominé par le bruit — un tirage
 * favorable, un abandon, un tenant du titre blessé suffisent à le faire
 * basculer. S'y ajuster maintenant reviendrait à sur-apprendre du hasard.
 * La synthèse ci-dessous ne porte donc QUE sur les tournois terminés, et
 * reste volontairement descriptive.
 */

/** Les tournois en cours ont un score tronqué : ils ne se comparent pas. */
const MIN_POUR_SYNTHESE = 5;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, j] = iso.slice(0, 10).split('-');
  return `${Number(j)}/${m}/${a.slice(2)}`;
}

/** Vert au-dessus de l'espérance, rouge en dessous — au-delà de 5 % d'écart. */
function classeEcart(ratio: number): string {
  if (ratio >= 1.05) return 'text-emerald-600 dark:text-emerald-400';
  if (ratio <= 0.95) return 'text-red-600 dark:text-red-400';
  return 'text-zinc-700 dark:text-zinc-300';
}

export default async function HistoriqueFantasyPage() {
  const [historique, tournois] = await Promise.all([
    listerHistorique(),
    listTournaments(),
  ]);

  const parId = new Map(tournois.map((t) => [t.id, t]));

  const lignes = historique
    .map((h) => {
      const t = parId.get(h.tournament_id);
      const predit = Number(h.e_predit ?? 0);
      const reel = Number(h.score_reel ?? 0);
      return {
        id: h.tournament_id,
        nom: t?.name ?? h.tournament_id,
        tour: t?.tour ?? '—',
        categorie: t?.category ?? null,
        date: t?.start_date ?? null,
        predit,
        reel,
        termine: h.termine,
        ratio: predit > 0 ? reel / predit : 0,
        equipe: h.equipe ?? [],
      };
    })
    // Ordre du calendrier, comme l'accueil : les lignes sans date en dernier.
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  const termines = lignes.filter((l) => l.termine && l.predit > 0);
  const sommePredit = termines.reduce((s, l) => s + l.predit, 0);
  const sommeReel = termines.reduce((s, l) => s + l.reel, 0);
  const ratioGlobal = sommePredit > 0 ? sommeReel / sommePredit : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Fantasy — prédit vs réalisé</h1>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Tournois
        </Link>
      </div>

      <p className="text-sm text-zinc-500">
        Pour chaque tournoi : l&apos;espérance a priori de l&apos;équipe
        optimale, composée depuis le tirage, et ce que cette même équipe a
        réellement marqué. Enregistré automatiquement à chaque import — rien à
        saisir.
      </p>

      <BackfillButton />

      {lignes.length === 0 ? (
        <p className="rounded border border-zinc-200 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-800">
          Aucun tournoi enregistré pour l&apos;instant. L&apos;historique se
          remplit à chaque import ; pour reprendre les tournois déjà en base,
          utiliser le bouton ci-dessus.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-3 font-medium">Début</th>
                  <th className="py-2 pr-3 font-medium">Tournoi</th>
                  <th className="py-2 pr-3 font-medium">Circuit</th>
                  <th className="py-2 pr-3 font-medium">Catégorie</th>
                  <th className="py-2 pr-3 text-right font-medium">Prédit</th>
                  <th className="py-2 pr-3 text-right font-medium">Réalisé</th>
                  <th className="py-2 pr-3 text-right font-medium">Écart</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-zinc-100 dark:border-zinc-900"
                  >
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-zinc-500">
                      {formatDate(l.date)}
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/tournoi/${l.id}/fantasy`}
                        className="font-medium hover:underline"
                      >
                        {l.nom}
                      </Link>
                      {!l.termine && (
                        <span
                          className="ml-2 text-xs text-amber-600 dark:text-amber-400"
                          title="Tournoi non terminé : le score réel est partiel, la ligne n'entre pas dans la synthèse."
                        >
                          en cours
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-zinc-500">{l.tour}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-zinc-500">
                      {l.categorie
                        ? (LIBELLE_CATEGORIE_COURT[l.categorie] ?? l.categorie)
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {l.predit.toFixed(1)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {l.reel.toFixed(1)}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-mono tabular-nums ${
                        l.termine ? classeEcart(l.ratio) : 'text-zinc-400'
                      }`}
                    >
                      {l.predit > 0
                        ? `${l.ratio >= 1 ? '+' : ''}${((l.ratio - 1) * 100).toFixed(0)} %`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded border border-zinc-200 px-3 py-3 text-sm dark:border-zinc-800">
            {termines.length === 0 ? (
              <p className="text-zinc-500">
                Aucun tournoi terminé pour l&apos;instant : rien à comparer. Un
                tournoi en cours a un score réel tronqué, qui tirerait toute
                moyenne vers le bas.
              </p>
            ) : (
              <>
                <p>
                  Sur{' '}
                  <span className="font-medium">
                    {termines.length} tournoi(s) terminé(s)
                  </span>{' '}
                  : {sommePredit.toFixed(0)} points attendus,{' '}
                  {sommeReel.toFixed(0)} réalisés, soit{' '}
                  <span className={`font-medium ${classeEcart(ratioGlobal)}`}>
                    {ratioGlobal >= 1 ? '+' : ''}
                    {((ratioGlobal - 1) * 100).toFixed(0)} %
                  </span>
                  .
                </p>
                <p className="mt-1.5 text-xs text-zinc-500">
                  {termines.length < MIN_POUR_SYNTHESE ? (
                    <>
                      Trop peu de tournois pour en conclure quoi que ce soit :
                      à ce stade, l&apos;écart est du bruit (un tirage favorable,
                      un abandon, un forfait suffisent à le faire basculer).
                      Compter une vingtaine de tournois terminés avant de
                      chercher un biais.
                    </>
                  ) : (
                    <>
                      Chiffre descriptif, à regarder — pas un réglage. Aucun
                      paramètre du modèle n&apos;en est dérivé, et rien n&apos;est
                      ajusté automatiquement : un biais persistant sur une
                      vingtaine de tournois se corrige à la main, en connaissance
                      de cause.
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
