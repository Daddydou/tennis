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
 *
 * DEUX COLONNES DE PRÉDIT, ET LA SECONDE EST LA BONNE. La première rejoue
 * l'équipe optimale avec les Elo d'AUJOURD'HUI, qui ont déjà intégré les
 * résultats du tournoi : les joueurs allés loin en sont ressortis relevés,
 * donc l'équipe reconstituée est en partie choisie POUR avoir bien fini, et
 * l'écart s'en trouve flatté. La seconde repart du dernier relevé Elo
 * antérieur au tirage — l'information dont on disposait le jour où l'équipe
 * se composait (cf. supabase/fantasy-anterieur.ts).
 *
 * L'archive Elo ne remonte pas le temps : les tournois joués avant sa mise en
 * place n'ont pas de colonne propre, et n'en auront jamais. Ils sont marqués
 * comme tels plutôt que comptés dans une moyenne qui ne les concerne pas.
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
      // Volet propre : présent seulement si un relevé Elo précède le tirage.
      const preditPropre =
        h.e_predit_anterieur === null ? null : Number(h.e_predit_anterieur);
      const reelPropre =
        h.score_reel_anterieur === null ? null : Number(h.score_reel_anterieur);
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
        preditPropre,
        reelPropre,
        ratioPropre:
          preditPropre !== null && reelPropre !== null && preditPropre > 0
            ? reelPropre / preditPropre
            : null,
        releveElo: h.elo_releve_le,
        joueursSansElo: h.joueurs_sans_elo,
      };
    })
    // Ordre du calendrier, comme l'accueil : les lignes sans date en dernier.
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  const termines = lignes.filter((l) => l.termine && l.predit > 0);
  const sommePredit = termines.reduce((s, l) => s + l.predit, 0);
  const sommeReel = termines.reduce((s, l) => s + l.reel, 0);
  const ratioGlobal = sommePredit > 0 ? sommeReel / sommePredit : 0;

  // Synthèse propre : le même calcul, sur les seuls tournois disposant d'un
  // Elo antérieur. Corpus différent, donc jamais mélangé au précédent.
  const propres = termines.filter(
    (l) => l.ratioPropre !== null && (l.preditPropre ?? 0) > 0,
  );
  const sommePreditPropre = propres.reduce((s, l) => s + (l.preditPropre ?? 0), 0);
  const sommeReelPropre = propres.reduce((s, l) => s + (l.reelPropre ?? 0), 0);
  const ratioPropreGlobal =
    sommePreditPropre > 0 ? sommeReelPropre / sommePreditPropre : 0;

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
                  <th
                    className="py-2 pr-3 text-right font-medium"
                    title="Équipe recomposée sur le dernier relevé Elo antérieur au tirage : l'information dont on disposait vraiment."
                  >
                    Prédit sans look-ahead
                  </th>
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
                    <td
                      className="py-2 pr-3 text-right font-mono tabular-nums"
                      title={
                        l.preditPropre === null
                          ? "Aucun relevé Elo n'est antérieur à ce tournoi : il ne peut pas être évalué sans look-ahead."
                          : `Elo du ${l.releveElo} · ${l.reelPropre?.toFixed(1)} réalisés` +
                            (l.joueursSansElo
                              ? ` · ${l.joueursSansElo} joueur(s) du tableau hors relevé`
                              : '')
                      }
                    >
                      {l.preditPropre === null ? (
                        <span className="text-zinc-400">—</span>
                      ) : (
                        l.preditPropre.toFixed(1)
                      )}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-mono tabular-nums ${
                        l.ratioPropre !== null && l.termine
                          ? classeEcart(l.ratioPropre)
                          : 'text-zinc-400'
                      }`}
                    >
                      {l.ratioPropre === null
                        ? '—'
                        : `${l.ratioPropre >= 1 ? '+' : ''}${((l.ratioPropre - 1) * 100).toFixed(0)} %`}
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
                {propres.length > 0 ? (
                  <p className="mt-1.5">
                    Sans look-ahead, sur{' '}
                    <span className="font-medium">
                      {propres.length} tournoi(s)
                    </span>{' '}
                    disposant d&apos;un Elo antérieur au tirage :{' '}
                    {sommePreditPropre.toFixed(0)} attendus,{' '}
                    {sommeReelPropre.toFixed(0)} réalisés, soit{' '}
                    <span className={`font-medium ${classeEcart(ratioPropreGlobal)}`}>
                      {ratioPropreGlobal >= 1 ? '+' : ''}
                      {((ratioPropreGlobal - 1) * 100).toFixed(0)} %
                    </span>
                    . C&apos;est ce chiffre-là qui compare ce qui est
                    comparable : l&apos;autre est calculé sur des Elo qui
                    connaissaient déjà l&apos;issue.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-violet-600 dark:text-violet-400">
                    Aucun tournoi terminé ne dispose encore d&apos;un Elo
                    antérieur à son tirage : le chiffre ci-dessus est calculé
                    sur les Elo d&apos;aujourd&apos;hui, qui ont déjà intégré
                    les résultats de ces tournois — il est donc flatté, et dans
                    une proportion inconnue. L&apos;archive Elo ne remonte pas
                    le temps ; elle se remplit d&apos;un instantané à chaque
                    import d&apos;Elo, et ce sont les tournois à venir qui
                    donneront la première mesure honnête.
                  </p>
                )}
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
