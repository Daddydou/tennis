import Image from 'next/image';
import CourtDessine from './CourtDessine';
import { photoDuTournoi } from './photosTournois';

/**
 * FOND D'UN TOURNOI — la photo du vrai lieu quand on en a une
 * (photosTournois.ts), sinon le court dessiné.
 *
 * La photo est traitée « Dark » : désaturée, assombrie, contrastée. Pour les
 * grands formats (`scene`, `bandeau`), elle entre comme sur le guide de la
 * série : elle s'ouvre à travers un cercle qui s'agrandit en sortant du flou,
 * un reflet en miroir glisse puis s'efface, ensuite elle « respire » (zoom très
 * lent) et glisse doucement quand on fait défiler la page. Tout est en CSS
 * (globals.css, « PHOTOS ») et se réduit à un fondu avec « Réduire les
 * animations ».
 *
 * Composant sans état ni hook : serveur comme client. Décoratif (`alt=""`) ;
 * le crédit (auteur, licence, lien) s'affiche sur les grands formats.
 */

/** Filtre « Dark » : couleurs éteintes, noirs denses. */
const FILTRE = 'grayscale(0.35) saturate(0.8) brightness(0.6) contrast(1.12)';

export default function FondTournoi({
  nom,
  surface,
  debut,
  variante,
  delai = '0ms',
}: {
  nom: string;
  surface: string | null | undefined;
  /** Date de début (AAAA-MM-JJ) : l'année choisit la bonne photo (lieux qui changent). */
  debut: string | null | undefined;
  /** scene = accueil ; bandeau = haut d'un tournoi ; carte = carte de l'accueil ; vignette = menu. */
  variante: 'scene' | 'bandeau' | 'carte' | 'vignette';
  /** Délai CSS avant l'entrée (grands formats), ex. `calc(var(--intro, 0s) + 300ms)`. */
  delai?: string;
}) {
  const photo = photoDuTournoi(nom, debut ? Number(debut.slice(0, 4)) : null);

  if (!photo) {
    if (variante === 'scene') {
      // Le court occupe le bas de la scène : le titre flotte dans le « ciel ».
      return (
        <div
          className="animate-fondu absolute inset-x-0 bottom-0 top-[36%]"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent, #000 30%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 30%)',
            animationDelay: delai,
          }}
        >
          <CourtDessine surface={surface} cadrage="haut" delai={`calc(${delai} + 300ms)`} />
        </div>
      );
    }
    if (variante === 'vignette') return <CourtDessine surface={surface} variante="plan" />;
    if (variante === 'carte') return <CourtDessine surface={surface} />;
    return (
      <div className="animate-fondu absolute inset-0" style={{ animationDelay: delai }}>
        <CourtDessine surface={surface} delai={`calc(${delai} + 200ms)`} />
      </div>
    );
  }

  if (variante === 'vignette' || variante === 'carte') {
    return (
      <Image
        src={photo.petit}
        alt=""
        fill
        unoptimized
        sizes="(min-width: 640px) 33vw, 100vw"
        className="object-cover transition duration-700 group-hover:scale-105"
        style={{ filter: FILTRE }}
      />
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Défilement : la photo glisse plus lentement que la page (parallaxe). */}
      <div className="fond-defile absolute inset-0">
        {/* Entrée : ouverture en cercle depuis le flou. */}
        <div className="fond-lentille absolute -inset-[4%]" style={{ animationDelay: delai }}>
          <Image
            src={photo.grand}
            alt=""
            fill
            unoptimized
            priority
            sizes="100vw"
            className="fond-respire object-cover"
            style={{ filter: FILTRE }}
          />
          {/* Reflet en miroir qui glisse puis s'efface. */}
          <Image
            src={photo.grand}
            alt=""
            fill
            unoptimized
            sizes="100vw"
            className="fond-miroir object-cover mix-blend-screen"
            style={{ filter: FILTRE, animationDelay: delai }}
          />
        </div>
      </div>
      <a
        href={photo.page}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-1.5 right-3 z-10 max-w-[70%] truncate text-[0.6rem] text-zinc-500 transition hover:text-zinc-800"
        title={`${photo.lieu} — photo ${photo.auteur}, licence ${photo.licence} (Wikimedia Commons)`}
      >
        {photo.lieu} · photo {photo.auteur} · {photo.licence}
      </a>
    </div>
  );
}
