import Link from 'next/link';
import { getParticipants } from '@/db/queries';
import { supabaseAnon } from '@/db/anon';
import { lireDonneesDavis } from '@/db/davis';
import { carte, filtreSecondaire, noteInfo } from '@/app/ui';
import { FormCreation, VueBracket, VueClassement, VuePicks, VuePronos, VueTableau, type ParticipantDavis } from './vues';

export const dynamic = 'force-dynamic';

const VUES = [
  { cle: 'classement', label: 'Classement' },
  { cle: 'tableau', label: 'Tableau' },
  { cle: 'picks', label: 'Picks' },
  { cle: 'bracket', label: 'Bracket' },
  { cle: 'pronos', label: 'Pronos' },
] as const;

type CleVue = (typeof VUES)[number]['cle'];

/**
 * Coupe Davis — phase finale à 8 nations (tournoi lancé par Thomas). Trois jeux : picks par pays, bracket
 * des nations, pronos des matchs. Règles et barèmes : lib/davis.ts (moteur pur, testé). N'entre ni au
 * palmarès ni dans la Race.
 */
export default async function PageDavis({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const un = (cle: string): string | undefined => {
    const v = sp[cle];
    return Array.isArray(v) ? v[0] : v;
  };
  const [donnees, lignesParticipants] = await Promise.all([lireDonneesDavis(supabaseAnon()), getParticipants()]);
  const participants: ParticipantDavis[] = [
    { cle: 'moi', id: null, nom: 'Moi' },
    ...lignesParticipants.map((p) => ({ cle: p.id, id: p.id, nom: p.name })),
  ];

  const demande = un('vue');
  const vue: CleVue = VUES.some((v) => v.cle === demande) ? (demande as CleVue) : 'classement';
  const actif = participants.some((p) => p.cle === un('p')) ? (un('p') as string) : 'moi';
  const maintenant = new Date();
  const erreur = un('erreur');
  const ok = un('ok');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Coupe Davis</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Phase finale à 8 nations : quarts, demies, finale. Chaque rencontre se joue en deux simples, puis un double seulement à 1-1.
        </p>
      </div>

      {erreur && (
        <p role="alert" className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-rate">
          {erreur}
        </p>
      )}
      {ok && (
        <p role="status" className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-juste">
          {ok}
        </p>
      )}

      {donnees.tablesAbsentes ? (
        <section className={`${carte} space-y-2 p-4`}>
          <h2 className="text-base font-semibold">Base pas encore prête</h2>
          <p className="text-sm text-zinc-600">
            La migration <code>0034_davis.sql</code> n’est pas encore appliquée à la base : applique-la (voir <code>MIGRATIONS.md</code>), puis
            recharge cette page.
          </p>
        </section>
      ) : donnees.rencontres.length === 0 ? (
        <FormCreation />
      ) : (
        <>
          <nav className="flex flex-wrap gap-1" aria-label="Vues de la Coupe Davis">
            {VUES.map((v) => (
              <Link key={v.cle} href={`/davis?vue=${v.cle}`} className={filtreSecondaire(v.cle === vue)} aria-current={v.cle === vue ? 'page' : undefined}>
                {v.label}
              </Link>
            ))}
          </nav>
          {vue === 'classement' && <VueClassement donnees={donnees} participants={participants} />}
          {vue === 'tableau' && <VueTableau donnees={donnees} maintenant={maintenant} />}
          {vue === 'picks' && <VuePicks donnees={donnees} participants={participants} actif={actif} maintenant={maintenant} />}
          {vue === 'bracket' && <VueBracket donnees={donnees} participants={participants} actif={actif} maintenant={maintenant} />}
          {vue === 'pronos' && <VuePronos donnees={donnees} participants={participants} actif={actif} maintenant={maintenant} />}
          <p className={noteInfo}>
            Les points s’appliquent dès qu’une rencontre est décidée. Pour les autres participants, recopie leurs choix une fois dévoilés dans
            l’app de Thomas.
          </p>
        </>
      )}
    </div>
  );
}
