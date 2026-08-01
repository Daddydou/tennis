import Link from 'next/link';
import ComparaisonEchelle from './ComparaisonEchelle';
import { ECHELLES_COMPAREES } from '@/supabase/comparaison-echelle';
import { ECHELLE_ELO } from '@/lib/elo';

export const dynamic = 'force-dynamic';

/**
 * COMPARATIF D'ÉCHELLES SUR L'HISTORIQUE FANTASY
 *
 * La page ne calcule rien au chargement : le comparatif rejoue une simulation
 * Monte Carlo par tournoi et par échelle, ce qui prend des dizaines de
 * secondes. Il se déclenche au bouton, comme le rafraîchissement des Elo.
 */
export default function ComparatifEchellePage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          Échelle Elo — effet sur l&apos;écart prédit / réalisé
        </h1>
        <Link
          href="/calibration"
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Calibration
        </Link>
      </div>

      <div className="space-y-1 text-sm text-zinc-500">
        <p>
          Pour chaque échelle candidate ({ECHELLES_COMPAREES.join(', ')}), on
          rejoue entièrement chaque tournoi terminé : simulation, espérances,
          composition de l&apos;équipe Fantasy optimale, puis score réel de{' '}
          <em>cette</em> équipe. Changer l&apos;échelle change les espérances{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            et souvent la composition
          </span>{' '}
          — les deux comptent, donc rien n&apos;est réutilisé du cache.
        </p>
        <p className="text-xs">
          Seuls les tournois{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            terminés
          </span>{' '}
          entrent dans le calcul : un score réel tronqué donnerait un écart
          négatif par construction, identique pour toutes les échelles.
          L&apos;échelle de production reste{' '}
          <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
            {ECHELLE_ELO}
          </span>{' '}
          — cette page ne la modifie pas.
        </p>
      </div>

      <ComparaisonEchelle />

      <div className="rounded border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <p className="font-medium">
          Pourquoi l&apos;échelle « optimale » d&apos;ici n&apos;est pas une
          conclusion
        </p>
        <p className="mt-1.5">
          <span className="font-medium">Même biais de circularité</span> que la
          page de calibration : les Elo utilisés sont ceux d&apos;aujourd&apos;hui,
          et ils intègrent déjà les résultats des matchs qu&apos;on rejoue. Les
          joueurs qui ont bien fini en sont ressortis avec un Elo relevé, donc
          leur espérance simulée est gonflée rétrospectivement — ce qui{' '}
          <span className="font-medium">
            avantage mécaniquement les échelles basses
          </span>
          , celles qui font le plus confiance à l&apos;écart d&apos;Elo.
        </p>
        <p className="mt-1.5">
          <span className="font-medium">Et c&apos;est le même corpus</span> que
          celui qui a servi à repérer 305. Retrouver un optimum bas ici ne le
          confirme donc pas : les deux mesures partagent leurs données comme
          leur biais. Ce n&apos;est pas une seconde preuve, c&apos;est la même,
          regardée sous un autre angle.
        </p>
        <p className="mt-1.5">
          La confirmation ne peut venir que de{' '}
          <span className="font-medium">tournois futurs</span>, simulés avant
          qu&apos;ils ne se jouent — c&apos;est précisément ce que{' '}
          <Link href="/fantasy" className="underline">
            l&apos;historique Fantasy
          </Link>{' '}
          accumule au fil des imports. D&apos;ici là, la valeur qui ressort de
          cette page est{' '}
          <span className="font-medium">indicative, pas définitive</span>.
        </p>
      </div>
    </div>
  );
}
