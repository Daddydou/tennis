import Link from 'next/link';
import { carte, zoneTactile } from '@/app/ui';
import { MAX_BRACKET, POINTS_BRACKET } from '@/lib/davis';
import { nomNation } from '@/lib/davisPronos';
import { type BracketDavisVue, type StockDavis, cleStockDavis } from '@/lib/davisVues';
import { LIBELLE_VERDICT_DAVIS, PastilleDavis } from '../PastilleDavis';

/**
 * Onglet Bracket de la Coupe Davis : le bracket des nations de chacun (nation gagnante + score de la rencontre),
 * rencontre par rencontre, lu sur Game Tracker. Pastille verte = juste, rouge = raté (ou nation déjà éliminée),
 * grise = en attente. Points gagnés et points encore possibles de chacun en tête.
 */
export default function DavisBracket({ id, vue, stocks }: { id: string; vue: BracketDavisVue; stocks: StockDavis[] }) {
  const manquants = stocks.filter((s) => (vue.totaux[cleStockDavis(s.id)]?.nb ?? 0) === 0);
  return (
    <div className="space-y-5" data-testid="davis-bracket">
      <section className={`${carte} space-y-3 p-4`}>
        <div>
          <h2 className="text-sm font-semibold">Bracket des nations</h2>
          <p className="text-xs text-zinc-500">
            Nation gagnante de chaque rencontre (quart {POINTS_BRACKET.QF.nation} pts, demie {POINTS_BRACKET.SF.nation}, finale {POINTS_BRACKET.F.nation}) et son score, en plus (+{POINTS_BRACKET.QF.score} / +
            {POINTS_BRACKET.SF.score} / +{POINTS_BRACKET.F.score}) : {MAX_BRACKET} points au mieux.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-3" aria-label="Points du bracket">
          {stocks.map((s) => {
            const t = vue.totaux[cleStockDavis(s.id)];
            return (
              <li key={cleStockDavis(s.id)} className="rounded-md bg-zinc-100 px-3 py-2 ring-1 ring-white/6">
                <p className="text-sm font-medium">{s.nom}</p>
                {t && t.nb > 0 ? (
                  <p className="text-xs text-zinc-600">
                    <span className="text-lg font-bold tabular-nums text-zinc-900">{t.points}</span> pts · encore {t.reste} possibles · {t.nb}/7 rencontres
                  </p>
                ) : (
                  <p className="text-xs text-zinc-500">pas encore importé</p>
                )}
              </li>
            );
          })}
        </ul>
        {manquants.length > 0 && (
          <p className="text-sm text-amber-700">
            Bracket manquant pour {manquants.map((s) => s.nom).join(', ')} :{' '}
            <Link href={`/tournoi/${id}/pronostic`} className={`${zoneTactile} font-medium underline underline-offset-2`}>
              coller la page Bracket de Game Tracker
            </Link>
            .
          </p>
        )}
      </section>

      {vue.tours.map((t) => (
        <section key={t.tour} className="space-y-2" aria-label={t.libelle}>
          <h2 className="text-sm font-semibold">{t.libelle}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {t.rencontres.map((r) => (
              <div key={r.id} className={`${carte} space-y-2 p-4`} data-testid="bracket-rencontre">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {t.tour === 'F' ? 'Finale' : `${t.tour === 'SF' ? 'Demie' : 'Quart'} ${r.position}`}{' '}
                    <span className="font-normal text-zinc-500">
                      {r.nation1 && r.nation2 ? `· ${nomNation(r.nation1)} – ${nomNation(r.nation2)}` : '· nations à déterminer'}
                    </span>
                  </h3>
                  <span className="text-xs tabular-nums text-zinc-600">{r.vainqueur ? `${nomNation(r.vainqueur)} ${r.score ?? ''}` : 'à jouer'}</span>
                </div>
                <ul className="space-y-1 text-sm">
                  {r.lignes.map((l) => (
                    <li key={l.cle} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {l.vide || !l.nation || !l.sets ? (
                          <>
                            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[0.65rem] text-zinc-500">–</span>
                            <span className="truncate text-xs text-zinc-500">{l.nom} : rien d&apos;importé</span>
                          </>
                        ) : (
                          <>
                            <PastilleDavis nom={l.nom} verdict={l.verdictNation} detail={`${nomNation(l.nation)} ${l.sets}`} />
                            <span className="truncate">
                              {l.nom} · <span className="font-medium">{nomNation(l.nation)}</span> {l.sets}
                              {l.verdictNation === 'juste' && l.verdictScore === 'rate' ? <span className="text-xs text-amber-700"> (score raté)</span> : null}
                            </span>
                          </>
                        )}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-600">
                        {l.points !== null ? `+${l.points}` : l.verdictNation === 'rate' && !l.vide ? 'éliminée' : l.vide ? '' : LIBELLE_VERDICT_DAVIS.attente}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
