import Link from 'next/link';
import { apiConfiguree, tournoisImportables, type TournoiImportable } from '@/db/importApi';
import { carte } from '@/app/ui';
import BoutonImportApi from './BoutonImportApi';

/**
 * Section « Tournois de la semaine » de /import (Server Component) : les
 * tournois ATP/WTA du circuit principal qui commencent entre il y a 10 jours
 * et dans 9 jours, lus dans le calendrier de l'API tennis (mis en cache 24 h,
 * donc ~2 requêtes par jour), avec un bouton d'import chacun.
 *
 * La page appelante vérifie la session avant de rendre ce composant.
 */

const SURFACES: Record<string, string> = { Hard: 'dur', 'I.hard': 'dur (indoor)', Clay: 'terre battue', Grass: 'gazon', Carpet: 'moquette' };

function jour(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function Carte({ t }: { t: TournoiImportable }) {
  const details = [t.tour, t.categorie, t.surface ? (SURFACES[t.surface] ?? t.surface) : null, `début ${jour(t.startDate)}`]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className={`${carte} space-y-3 p-4 text-sm`}>
      <div>
        <p className="font-medium">
          <span className={t.tour === 'WTA' ? 'text-fuchsia-700' : 'text-blue-700'}>{t.tour}</span> {t.nom}
        </p>
        <p className="text-zinc-500">{details}</p>
        {t.enBase?.source === 'api' && (
          <p className="mt-1 text-emerald-700">
            Déjà importé{t.enBase.surveille ? (t.enBase.actif ? ' · mise à jour auto toutes les 6 h' : ' · surveillance arrêtée') : ''} ·{' '}
            <Link href={`/tournoi/${t.enBase.tournamentId}/picks`} className="underline">
              ouvrir
            </Link>
          </p>
        )}
        {t.enBase?.source === 'bookmarklet' && (
          <p className="mt-1 text-zinc-600">
            Déjà importé par le bookmarklet (« {t.enBase.nom} »), mis à jour comme avant ·{' '}
            <Link href={`/tournoi/${t.enBase.tournamentId}/picks`} className="underline">
              ouvrir
            </Link>
          </p>
        )}
      </div>
      {t.enBase?.source === 'api' && (
        <BoutonImportApi cible={{ tournamentId: t.enBase.tournamentId }} libelle="Mettre à jour maintenant" principal={false} />
      )}
      {!t.enBase && <BoutonImportApi cible={{ seasonId: t.seasonId, type: t.type }} libelle="Importer le tableau" />}
    </li>
  );
}

export default async function TournoisApi() {
  if (!apiConfiguree()) {
    return (
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Tournois de la semaine</h2>
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Import depuis l&apos;API désactivé : la variable <code>RAPIDAPI_KEY</code> n&apos;est pas configurée.
        </p>
      </section>
    );
  }
  let tournois: TournoiImportable[];
  try {
    tournois = await tournoisImportables();
  } catch (e) {
    return (
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Tournois de la semaine</h2>
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">Calendrier illisible : {(e as Error).message}</p>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Tournois de la semaine</h2>
        <p className="text-sm text-zinc-500">
          Un appui suffit : le tableau, les résultats et les cotes viennent de l&apos;API, puis se mettent à jour
          tout seuls toutes les 6 h jusqu&apos;à la finale. Chaque import ou mise à jour coûte 1 requête sur les 50 du jour.
        </p>
      </div>
      {tournois.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun tournoi ATP/WTA du circuit principal cette semaine ou la suivante.</p>
      ) : (
        <ul className="space-y-3">
          {tournois.map((t) => (
            <Carte key={`${t.type}-${t.seasonId}`} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}
