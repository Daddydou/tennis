import { COLONNE, RAYON, RAYON_VAINQUEUR, initiales, type Arbre, type NoeudArbre } from './arbreGeometrie';

/**
 * ARBRE DU TABLEAU — dessiné comme l'arbre généalogique du guide Dark.
 *
 * Chaque joueur est un cercle (ses initiales) avec son nom dessous, reliés par
 * des traits fins ; la moitié haute du tableau à gauche, la basse à droite, le
 * vainqueur au centre dans un cercle jaune qui rayonne. Sous un joueur, des
 * points de couleur disent qui l'a choisi pour gagner ce match (Moi, Laki,
 * Thomas...).
 *
 * Composant sans état ni hook (serveur comme client). Toute la géométrie vient
 * de `construireArbre` (arbreGeometrie.ts, testé) ; ici on ne fait que poser.
 * L'arbre est décoratif pour un lecteur d'écran : la même information est
 * donnée en liste (`sr-only`) juste à côté.
 */

export type Marque = { nom: string; couleur: string };

const rem = (v: number) => `${v}rem`;

function Noeud({
  n,
  nom,
  rang,
  marques,
  delai,
}: {
  n: NoeudArbre;
  nom: string | null;
  rang: number | null;
  marques: Marque[];
  /** Ms avant l'apparition : l'arbre se construit de l'extérieur vers le vainqueur. */
  delai: number;
}) {
  const rayon = n.vainqueurFinal ? RAYON_VAINQUEUR : RAYON;
  const cercle = n.vainqueurFinal
    ? n.joueur
      ? 'border-accent text-zinc-950 shadow-[0_0_28px_6px_rgba(215,242,90,.32)]'
      : 'border-dashed border-accent/50 text-accent/70'
    : n.etat === 'gagnant'
      ? 'border-white/75 text-zinc-950'
      : n.etat === 'perdant'
        ? 'border-white/15 text-zinc-500'
        : n.etat === 'vide'
          ? 'border-dashed border-white/20 text-zinc-500'
          : 'border-white/35 text-zinc-800';
  return (
    <div
      className={`absolute flex flex-col items-center gap-1.5 ${n.vainqueurFinal ? 'animate-eclore' : 'animate-scintille'}`}
      style={{ left: rem(n.x - COLONNE / 2), top: rem(n.y - rayon), width: rem(COLONNE), animationDelay: `${delai}ms` }}
    >
      <div
        className={`flex items-center justify-center rounded-full border bg-[#0b0e12] font-titre tracking-[0.08em] ${cercle} ${
          n.vainqueurFinal ? 'text-lg' : 'text-[0.8rem]'
        }`}
        style={{ width: rem(2 * rayon), height: rem(2 * rayon) }}
      >
        {nom ? initiales(nom) : n.vainqueurFinal ? '?' : '—'}
      </div>
      <div
        className={`max-w-full truncate px-1 text-center text-[0.68rem] uppercase leading-tight tracking-[0.1em] ${
          n.etat === 'perdant' ? 'text-zinc-500 line-through decoration-white/30' : n.vainqueurFinal ? 'text-zinc-950' : 'text-zinc-700'
        }`}
        title={nom ? (rang !== null ? `${nom} (#${rang})` : nom) : undefined}
      >
        {nom ?? (n.vainqueurFinal ? 'À jouer' : 'À déterminer')}
      </div>
      {marques.length > 0 && (
        <div className="flex gap-1">
          {marques.map((m) => (
            <span key={m.nom} title={m.nom} className="size-[0.45rem] rounded-full" style={{ background: m.couleur }} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ArbreBracket({
  arbre,
  joueurs,
  marques = {},
  libelle,
  libelleVainqueur,
}: {
  arbre: Arbre;
  joueurs: Record<string, { nom: string; rang: number | null }>;
  /** Clé `${round}|${position}|${joueurId}` -> qui a choisi ce joueur pour gagner ce match. */
  marques?: Record<string, Marque[]>;
  /** Nom de l'arbre pour un lecteur d'écran (« Tableau réel depuis les quarts »...). */
  libelle: string;
  /** « Vainqueur », « Champion prédit »... */
  libelleVainqueur: string;
}) {
  const nom = (id: string | null) => (id ? (joueurs[id]?.nom ?? id) : null);
  const duels = arbre.noeuds.filter((n) => !n.vainqueurFinal && n.cle.endsWith('|a'));
  const vainqueur = arbre.noeuds.find((n) => n.vainqueurFinal)?.joueur ?? null;

  // Construction de l'extérieur vers le centre : une colonne toutes les 160 ms,
  // le vainqueur en dernier. Les traits poussent depuis leur bout extérieur.
  const centre = arbre.largeur / 2;
  const distance = (x: number) => Math.round(Math.abs(x - centre) / COLONNE);
  const plusLoin = Math.max(0, ...arbre.noeuds.map((n) => distance(n.x)));
  const delai = (x: number) => (plusLoin - distance(x)) * 160;

  return (
    <figure className="space-y-2">
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div
          className="relative mx-auto"
          style={{ width: rem(arbre.largeur), height: rem(arbre.hauteur + 2.5) }}
          aria-hidden="true"
        >
          {arbre.traits.map((t, i) =>
            t.type === 'h' ? (
              <div
                key={i}
                className={`animate-pousse absolute h-px ${t.accent ? 'bg-accent/70' : 'bg-white/30'}`}
                style={{
                  left: rem(t.x),
                  top: rem(t.y),
                  width: rem(Math.max(t.largeur, 0)),
                  transformOrigin: t.x < centre ? 'left' : 'right',
                  animationDelay: `${delai(t.x < centre ? t.x : t.x + t.largeur) + 80}ms`,
                }}
              />
            ) : (
              <div
                key={i}
                className={`animate-fondu absolute border-y border-white/30 ${t.ouvert === 'gauche' ? 'border-r' : 'border-l'}`}
                style={{
                  left: rem(t.x),
                  top: rem(t.y),
                  width: rem(t.largeur),
                  height: rem(t.hauteur),
                  animationDelay: `${delai(t.ouvert === 'gauche' ? t.x : t.x + t.largeur) + 60}ms`,
                }}
              />
            ),
          )}
          {arbre.noeuds.map((n) => (
            <Noeud
              key={n.cle}
              n={n}
              nom={nom(n.joueur)}
              rang={n.joueur ? (joueurs[n.joueur]?.rang ?? null) : null}
              marques={n.joueur && n.round ? (marques[`${n.round}|${n.position}|${n.joueur}`] ?? []) : []}
              delai={delai(n.x)}
            />
          ))}
        </div>
      </div>
      <figcaption className="sr-only">
        {libelle}. {libelleVainqueur} : {nom(vainqueur) ?? 'à jouer'}.
        <ul>
          {duels.map((a) => {
            const b = arbre.noeuds.find((n) => n.cle === a.cle.replace(/\|a$/, '|b'));
            const v = a.etat === 'gagnant' ? a.joueur : b?.etat === 'gagnant' ? b.joueur : null;
            return (
              <li key={a.cle}>
                {a.round} : {nom(a.joueur) ?? 'à déterminer'} contre {nom(b?.joueur ?? null) ?? 'à déterminer'}
                {v ? `, ${nom(v)} passe` : ''}
              </li>
            );
          })}
        </ul>
      </figcaption>
    </figure>
  );
}
