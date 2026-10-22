import { vueImportsAuto, type VueSurveillance } from '@/db/importAuto';
import { prochainPassage } from '@/lib/importAutoRegles';
import { carte } from '@/app/ui';
import BoutonSurveillance from './BoutonSurveillance';

/**
 * Section « Imports automatiques » de /import (Server Component). Les tables
 * lues sont PRIVÉES (service role) : la page appelante vérifie la session
 * avant de rendre ce composant.
 */

const MOTIFS: Record<string, string> = {
  finale_importee: 'finale importée',
  plafond_21j: 'plafond de 21 jours',
  fin_tournoi: 'tournoi terminé',
  manuel: 'arrêt manuel',
};

function date(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function prochain(s: VueSurveillance): string {
  if (!s.actif) return '—';
  const p = prochainPassage(s);
  if (!p) return 'dès le prochain passage';
  const quand = s.mode === 'navigateur' ? 'à la 1re visite du site après le' : 'au 1er passage du cron après le';
  return `${quand} ${date(p.toISOString())}`;
}

const MODES: Record<string, string> = {
  api: 'API (serveur, toutes les 6 h)',
  serveur: 'page WTA (serveur)',
  navigateur: 'userscript (navigateur)',
};

export function SectionImportsAuto({ lignes }: { lignes: VueSurveillance[] }) {
  const enAlerte = lignes.filter((s) => s.actif && s.echecs_consecutifs >= 2);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Imports automatiques</h2>

      {enAlerte.length > 0 && (
        <div role="alert" className="rounded-xl bg-red-600 p-3 text-sm font-medium text-white">
          {enAlerte.map((s) => (
            <p key={s.tournament_id}>
              {s.nom} : {s.echecs_consecutifs} échecs d&apos;import consécutifs —{' '}
              {s.derniere_erreur ?? 'erreur inconnue'}
            </p>
          ))}
        </div>
      )}

      {lignes.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun tournoi surveillé. Le premier import réussi d&apos;un tournoi l&apos;inscrit :
          il est ensuite réimporté automatiquement jusqu&apos;à la finale.
        </p>
      ) : (
        <ul className="space-y-3">
          {lignes.map((s) => (
            <li key={s.tournament_id} className={`${carte} space-y-2 p-4 text-sm`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {s.nom}{' '}
                  <span className="font-normal text-zinc-500">
                    · {s.tour} · {MODES[s.mode] ?? `mode ${s.mode}`} ·{' '}
                    {s.actif
                      ? 'actif'
                      : `arrêté (${MOTIFS[s.motif_arret ?? ''] ?? s.motif_arret}, ${date(s.arrete_at)})`}
                  </span>
                </p>
                <BoutonSurveillance tournamentId={s.tournament_id} actif={s.actif} />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-zinc-700">
                <dt className="text-zinc-500">Dernier succès</dt>
                <dd>{date(s.dernier_succes_at)}</dd>
                <dt className="text-zinc-500">Prochain passage</dt>
                <dd>{prochain(s)}</dd>
                <dt className="text-zinc-500">Échecs consécutifs</dt>
                <dd className={s.echecs_consecutifs > 0 ? 'font-medium text-red-700' : ''}>
                  {s.echecs_consecutifs}
                </dd>
                {s.derniere_erreur && (
                  <>
                    <dt className="text-zinc-500">Dernière erreur</dt>
                    <dd className="break-words text-red-700">{s.derniere_erreur}</dd>
                  </>
                )}
              </dl>
              {s.journal.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-zinc-500">
                    {s.journal.length} derniers passages
                  </summary>
                  <ul className="mt-1 space-y-0.5 font-mono text-xs">
                    {s.journal.map((l) => (
                      <li key={l.id} className={l.ok ? 'text-zinc-700' : 'text-red-700'}>
                        {date(l.created_at)} · {l.source} · {l.ok ? 'OK' : 'ÉCHEC'}
                        {l.matchs_total != null && ` · ${l.matchs_total} matchs`}
                        {l.matchs_changes != null && `, ${l.matchs_changes} changés`}
                        {l.duree_ms != null && ` · ${(l.duree_ms / 1000).toFixed(1)} s`}
                        {l.erreur && ` · ${l.erreur}`}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ImportsAuto() {
  let lignes: VueSurveillance[];
  try {
    lignes = await vueImportsAuto();
  } catch (e) {
    return (
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Imports automatiques</h2>
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">
          Lecture impossible : {(e as Error).message} (migration 0026 appliquée ?)
        </p>
      </section>
    );
  }
  return <SectionImportsAuto lignes={lignes} />;
}
