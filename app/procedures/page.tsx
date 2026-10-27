import type { Metadata } from 'next';
import { carte } from '@/app/ui';
import { GROUPES, type Procedure } from './procedures';

export const metadata: Metadata = {
  title: 'Procédures - Picks Tennis',
};

/** Affiche `code` entre accents graves comme un petit bloc de code. */
function Texte({ children }: { children: string }) {
  return (
    <>
      {children.split('`').map((morceau, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-zinc-100 px-1 py-0.5 text-[0.85em] text-zinc-800">
            {morceau}
          </code>
        ) : (
          <span key={i}>{morceau}</span>
        ),
      )}
    </>
  );
}

function dateFr(iso: string): string {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

function Fiche({ p }: { p: Procedure }) {
  return (
    <details id={p.id} className={`${carte} group scroll-mt-4 open:pb-1`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="mt-1 text-zinc-500 transition-transform group-open:rotate-90"
        >
          ›
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{p.titre}</span>
          <span className="block text-sm text-zinc-500">{p.resume}</span>
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-3 pl-10 text-sm">
        <p>
          <span className="font-medium">Quand : </span>
          <Texte>{p.quand}</Texte>
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 marker:text-zinc-400">
          {p.etapes.map((e, i) => (
            <li key={i}>
              <Texte>{e}</Texte>
            </li>
          ))}
        </ol>
        {p.attention && p.attention.length > 0 && (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-950">
            <p className="font-medium">À savoir</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {p.attention.map((a, i) => (
                <li key={i}>
                  <Texte>{a}</Texte>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-zinc-500">
          {p.doc && (
            <>
              Détail : <Texte>{`\`${p.doc}\``}</Texte> ·{' '}
            </>
          )}
          mis à jour le {dateFr(p.maj)}
        </p>
      </div>
    </details>
  );
}

export default function ProceduresPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Procédures</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Les gestes à connaître, en quelques étapes. Touche une ligne pour la
          déplier. Cette page évolue avec l’app : pour la corriger ou ajouter un
          geste, demande à Claude de modifier{' '}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.85em]">
            app/procedures/procedures.ts
          </code>
          .
        </p>
        <nav className="mt-3 flex flex-wrap gap-2 text-sm">
          {GROUPES.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="inline-flex min-h-11 items-center rounded-xl bg-white px-3 shadow-card transition active:scale-[0.97] hover:bg-zinc-50"
            >
              {g.titre}
            </a>
          ))}
        </nav>
      </div>
      {GROUPES.map((g) => (
        <section key={g.id} id={g.id} className="scroll-mt-4 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {g.titre}
          </h2>
          {g.procedures.map((p) => (
            <Fiche key={p.id} p={p} />
          ))}
        </section>
      ))}
    </div>
  );
}
