/**
 * DÉTAIL D'UN INSIGHT JOUEUR — résumé en clair + faits sourcés.
 *
 * Chaque fait ouvre sa source dans un nouvel onglet. Seules les URL http(s)
 * deviennent des liens (urlSure) : les autres restent du texte simple.
 */

import { urlSure, type ConfianceInsight, type PlayerInsight } from '@/lib/insights';

const CONFIANCE: Record<ConfianceInsight, string> = {
  high: 'fiable',
  medium: 'à confirmer',
  low: 'incertain',
};

/** « 2026-09-26 » → « 26/09 » ; toute autre forme est rendue telle quelle. */
const dateCourte = (d: string | null) => {
  const m = d?.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : d;
};

export default function InsightDetail({ insight }: { insight: PlayerInsight }) {
  const contexte = [
    insight.surfaceSwitch && 'changement de surface',
    insight.homeTournament && 'tournoi à domicile',
  ].filter(Boolean);

  return (
    <div className="space-y-1.5 bg-zinc-50 px-2.5 py-2 text-xs text-zinc-700">
      {insight.summary && <p className="leading-snug">{insight.summary}</p>}
      {contexte.length > 0 && (
        <p className="text-zinc-500">Contexte : {contexte.join(' · ')}</p>
      )}
      {insight.facts.length > 0 && (
        <ul className="space-y-1">
          {insight.facts.map((f, i) => {
            const url = urlSure(f.source);
            const contenu = (
              <>
                {f.date && (
                  <span className="mr-1 tabular-nums text-zinc-400">{dateCourte(f.date)}</span>
                )}
                <span>{f.text}</span>
                {f.confidence && f.confidence !== 'high' && (
                  <span className="ml-1 italic text-zinc-400">({CONFIANCE[f.confidence]})</span>
                )}
                {url && <span className="ml-1 text-zinc-400">↗</span>}
              </>
            );
            return (
              <li key={i}>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg py-1 underline-offset-2 hover:underline"
                  >
                    {contenu}
                  </a>
                ) : (
                  <span className="block py-1">{contenu}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-zinc-400">
        Info du {dateCourte(insight.asOf)} · {CONFIANCE[insight.confidence]} · affichage
        seul, n&apos;entre pas dans la simulation
      </p>
    </div>
  );
}
