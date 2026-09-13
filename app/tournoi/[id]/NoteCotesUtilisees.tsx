/**
 * TRAÇABILITÉ DU BLEND ELO/COTES — GARDE-FOU VISUEL
 *
 * Pendant du BadgeSourceElo, à l'échelle du tournoi plutôt que du joueur :
 * dit si le calcul affiché (Picks/Fantasy/Prédictions/Bracket) a mélangé les
 * cotes du marché à l'Elo, et sur combien de duels — pour que l'utilisateur
 * comprenne pourquoi une recommandation a pu changer depuis le branchement
 * du blend (cf. supabase/cotesBlend.ts).
 *
 * Silencieuse par construction : `n` vaut 0 dès qu'aucune cote utilisable
 * n'existe pour ce tournoi (jamais capturée, ou pas encore appariée/datée) —
 * le calcul reste alors l'Elo seul, et rien ne s'affiche, plutôt qu'un badge
 * qui dirait « 0 cote » sans le rendre visuellement différent d'un vrai 0.
 */
export default function NoteCotesUtilisees({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <p className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">
      Cotes du marché prises en compte : Elo mélangé aux cotes (30&nbsp;% Elo /
      70&nbsp;% cotes) sur {n} match{n > 1 ? 's' : ''} de ce tournoi — les autres
      restent sur l&apos;Elo seul, faute de cote utilisable.
    </p>
  );
}
