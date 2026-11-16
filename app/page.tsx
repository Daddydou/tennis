import Link from 'next/link';
import { listTournaments } from '@/db/queries';
import { picksAPoserMoi } from '@/db/picksAPoser';
import { boutonSecondaire } from './ui';
import BoutonLireGameTracker from './BoutonLireGameTracker';
import SceneAccueil from './SceneAccueil';
import { CarteTournoi, commenceDansLaSemaine, fraicheur, ListeTournois } from './tournoisUi';

export const dynamic = 'force-dynamic';
// La lecture globale de Game Tracker enchaîne plusieurs tournois (Server Action de cette page).
export const maxDuration = 60;

/** Combien de tournois récents sous les cartes ; la liste complète est sur /tournois. */
const NB_RECENTS = 5;

export default async function Home() {
  const tournois = await listTournaments();
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const enCours = tournois.filter((t) => fraicheur(t, aujourdHui) === 'en-cours');
  const bientot = tournois.filter((t) => commenceDansLaSemaine(t, aujourdHui));
  const dejaAffiches = new Set([...enCours, ...bientot].map((t) => t.id));
  const recents = tournois.filter((t) => !dejaAffiches.has(t.id)).slice(0, NB_RECENTS);
  // Picks que je dois encore poser, pour les seules cartes « En cours ».
  const aPoser = await picksAPoserMoi(enCours);

  // Le tournoi « vedette » de la scène d'ouverture : le premier en cours, sinon
  // celui qui démarre cette semaine, sinon le plus récent.
  const vedette = enCours[0] ?? bientot[0] ?? tournois[0] ?? null;

  return (
    <div className="space-y-10">
      <SceneAccueil
        tournois={tournois}
        vedette={vedette}
        etat={vedette && enCours.includes(vedette) ? 'en-cours' : vedette && bientot.includes(vedette) ? 'bientot' : 'passe'}
        aPoser={vedette ? (aPoser.get(vedette.id) ?? null) : null}
        aujourdHui={aujourdHui}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        {enCours.length > 0 || bientot.length > 0 ? <BoutonLireGameTracker /> : <span />}
        <Link href="/import" className={boutonSecondaire}>
          Importer un tableau
        </Link>
      </div>

      {tournois.length === 0 ? (
        <p className="text-sm text-zinc-600">
          Aucun tournoi. Commence par{' '}
          <Link href="/import" className="font-medium text-accent underline underline-offset-2">
            importer un tableau
          </Link>
          .
        </p>
      ) : (
        <>
          {/* ── En cours : le point de départ. Un tournoi = une carte, avec
              l'accès direct à ses picks, sans chercher dans la liste. ── */}
          {enCours.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs">En cours</h2>
              <ul className="cascade grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {enCours.map((t) => (
                  <CarteTournoi key={t.id} t={t} debut="depuis le" aPoser={aPoser.get(t.id)} />
                ))}
              </ul>
            </section>
          )}

          {/* ── Bientôt : un tournoi qui commence dans la semaine. ── */}
          {bientot.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs">Cette semaine</h2>
              <ul className="cascade grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {bientot.map((t) => (
                  <CarteTournoi key={t.id} t={t} debut="début le" />
                ))}
              </ul>
            </section>
          )}

          {enCours.length === 0 && bientot.length === 0 && (
            <p className="text-sm text-zinc-600">Aucun tournoi en cours ni cette semaine.</p>
          )}

          {recents.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xs">Derniers tournois</h2>
                <Link
                  href="/tournois"
                  className="flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-accent hover:underline"
                >
                  Tous les tournois ({tournois.length})
                </Link>
              </div>
              <ListeTournois tournois={recents} aujourdHui={aujourdHui} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
