import { couleurPoints } from '@/app/ui';
import type { PickAnalyse } from '@/lib/stats/picks';
import type { DonneesVue } from './donnees';
import {
  Chiffre,
  Chiffres,
  Section,
  Tableau,
  TauxBarre,
  Vide,
  classeEcart,
  libelleTour,
  nb,
  pct,
  signe,
} from './composants';

type Donnees = Extract<DonneesVue, { vue: 'picks' }>;

export default function VuePicks({ d }: { d: Donnees }) {
  const nom = (id: string | null) => (id ? (d.noms[id] ?? '?') : '?');
  const decrire = (a: PickAnalyse) => (
    <span>
      <span className="font-medium">{nom(a.pick.player_id)}</span>{' '}
      <span className="text-zinc-500">
        {a.tournoi?.name ?? '?'} · {libelleTour(a.pick.round)}
        {a.adversaireId ? ` · contre ${nom(a.adversaireId)}` : ''}
      </span>
    </span>
  );

  if (d.nbPicks === 0) {
    return <Vide>{d.stock.nom} n&apos;a posé aucun pick sur cette période.</Vide>;
  }

  return (
    <div className="space-y-4">
      <Chiffres>
        <Chiffre libelle="picks posés" valeur={d.nbPicks} />
        <Chiffre libelle="picks gagnés" valeur={d.taux.total.gagnes} />
        <Chiffre libelle="picks perdus" valeur={d.taux.total.perdus} />
        <Chiffre libelle="taux de réussite" valeur={pct(d.taux.total.taux)} />
        <Chiffre libelle="points" valeur={nb(d.decomposition.total)} />
      </Chiffres>

      <Section num="10" titre="Taux de picks justes, par tour" aide="Un pick est juste quand son joueur gagne le match. Les matchs pas encore joués sont à part.">
        <Tableau
          colonnes={['Tour', 'Picks', 'Gagnés', 'Perdus', 'En attente', 'Réussite']}
          lignes={d.taux.parTour.map((t) => [
            libelleTour(t.round),
            t.n,
            t.gagnes,
            t.perdus,
            t.attente,
            <TauxBarre key="t" valeur={t.taux} />,
          ])}
        />
      </Section>

      <Section
        num="11"
        titre="Picks sûrs contre picks risqués"
        aide="Chaque pick est rangé selon la probabilité de victoire du moteur Elo contre son adversaire réel. Réserve : l'Elo est celui d'aujourd'hui, pas celui du jour du pick."
      >
        <Tableau
          colonnes={['Type de pick', 'Picks', 'Proba annoncée', 'Réussite réelle', 'Points moyens']}
          lignes={d.surete.tranches.map((t) => [
            t.libelle,
            t.n,
            pct(t.pMoyenne),
            <TauxBarre key="t" valeur={t.taux} />,
            nb(t.pointsMoyens, 1),
          ])}
        />
        {d.surete.sansProba > 0 && (
          <p className="text-xs text-zinc-500">{d.surete.sansProba} pick(s) joué(s) sans Elo connu, non rangés.</p>
        )}
      </Section>

      <Section num="12" titre="Chance ou talent ?" aide="Points réellement marqués moins points espérés au moment du pick. Positif : tu as eu plus de réussite que ce que le moteur prévoyait.">
        {d.chance.n === 0 ? (
          <Vide />
        ) : (
          <>
            <Chiffres>
              <Chiffre libelle="points marqués" valeur={nb(d.chance.points)} />
              <Chiffre libelle="points espérés" valeur={nb(d.chance.esperance, 1)} />
              <Chiffre libelle="écart" valeur={<span className={classeEcart(d.chance.ecart)}>{signe(d.chance.ecart, 1)}</span>} />
            </Chiffres>
            <Tableau
              colonnes={['Tournoi', 'Points', 'Espérés', 'Écart']}
              lignes={d.chance.parTournoi.map((t) => [
                t.tournoi,
                nb(t.points),
                nb(t.esperance, 1),
                <span key="e" className={classeEcart(t.ecart)}>
                  {signe(t.ecart, 1)}
                </span>,
              ])}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-zinc-500">Picks les plus chanceux</p>
                <ul className="space-y-1 text-sm">
                  {d.chance.plusChanceux.map((x, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      {decrire(x.analyse)}
                      <span className={`shrink-0 tabular-nums ${classeEcart(x.ecart)}`}>{signe(x.ecart, 1)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs text-zinc-500">Picks les plus malchanceux</p>
                <ul className="space-y-1 text-sm">
                  {d.chance.plusMalchanceux.map((x, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      {decrire(x.analyse)}
                      <span className={`shrink-0 tabular-nums ${classeEcart(x.ecart)}`}>{signe(x.ecart, 1)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </Section>

      <Section num="13" titre="Meilleurs et pires picks de la saison">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { titre: 'Les plus rentables', liste: d.extremes.meilleurs },
            { titre: 'Les plus coûteux', liste: d.extremes.pires },
          ].map((bloc) => (
            <div key={bloc.titre}>
              <p className="mb-1 text-xs text-zinc-500">{bloc.titre}</p>
              <ul className="space-y-1 text-sm">
                {bloc.liste.map((a, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    {decrire(a)}
                    <span className={`shrink-0 tabular-nums ${couleurPoints(a.pick.points)}`}>{signe(a.pick.points ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section num="14" titre="D'où viennent les points" aide="Ce que rapporte chaque composante du barème (victoire du match, sets, jeux), sur les picks joués.">
        <Tableau
          colonnes={['Composante', 'Points', 'Part du total', 'Par pick']}
          lignes={d.decomposition.composantes.map((c) => [
            c.libelle,
            nb(c.net),
            <TauxBarre key="p" valeur={d.decomposition.total === 0 ? null : c.net / d.decomposition.total} />,
            nb(d.decomposition.nbPicks === 0 ? null : c.net / d.decomposition.nbPicks, 1),
          ])}
        />
      </Section>

      <Section num="15" titre="Les points perdus" aide="Picks perdus, selon la cause, et les plus lourds en espérance de points.">
        {d.perdus.perdus === 0 ? (
          <Vide>Aucun pick perdu.</Vide>
        ) : (
          <>
            <Chiffres>
              <Chiffre libelle="picks perdus" valeur={d.perdus.perdus} />
              <Chiffre libelle="défaites" valeur={d.perdus.parRaison.defaite} />
              <Chiffre libelle="abandons du joueur" valeur={d.perdus.parRaison.abandon} />
              <Chiffre libelle="forfaits" valeur={d.perdus.parRaison.forfait} />
              <Chiffre libelle="espérance en jeu" valeur={nb(d.perdus.esperanceEnJeu, 1)} aide="points" />
            </Chiffres>
            <ul className="space-y-1 text-sm">
              {d.perdus.liste.map((a, i) => (
                <li key={i} className="flex justify-between gap-2">
                  {decrire(a)}
                  <span className="shrink-0 tabular-nums text-zinc-500">espérés {nb(a.pick.e_points, 1)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section num="16" titre="Stratégie de stock" aide="Quelle force de joueur poses-tu à chaque tour (Elo moyen), et que rapporte-t-il ? Garde-t-on les meilleurs pour la fin ?">
        <Tableau
          colonnes={['Tour', 'Picks', 'Elo moyen du joueur', 'Réussite', 'Points moyens']}
          lignes={d.strategie.map((s) => [libelleTour(s.round), s.n, nb(s.eloMoyen), <TauxBarre key="t" valeur={s.taux} />, nb(s.pointsMoyens, 1)])}
        />
      </Section>

      <Section num="17" titre="Mes joueurs fétiches" aide="Les joueurs pris au moins deux fois, du plus fréquent au moins fréquent.">
        {d.fetiches.length === 0 ? (
          <Vide />
        ) : (
          <Tableau
            colonnes={['Joueur', 'Picks', 'Gagnés', 'Points', 'Points / pick']}
            lignes={d.fetiches.map((f) => [nom(f.joueurId), f.n, f.gagnes, nb(f.points), nb(f.moyenne, 1)])}
          />
        )}
      </Section>

      <Section num="18" titre="Mes bêtes noires" aide="Joueurs pris au moins deux fois qui rapportent moins que la moyenne de tes picks.">
        {d.betesNoires.length === 0 ? (
          <Vide />
        ) : (
          <Tableau
            colonnes={['Joueur', 'Picks', 'Perdus', 'Points', 'Points / pick']}
            lignes={d.betesNoires.map((f) => [nom(f.joueurId), f.n, f.perdus, nb(f.points), nb(f.moyenne, 1)])}
          />
        )}
      </Section>

      <Section num="19" titre="Suivre le plan ou pas" aide="Réservations de l'écran Picks comparées aux picks finalement validés. Les réservations ne sont gardées que pour les tours à venir : l'échantillon grandit au fil des tournois.">
        {d.plan.total === 0 ? (
          <Vide>Aucune réservation en base pour l&apos;instant.</Vide>
        ) : (
          <Chiffres>
            <Chiffre libelle="réservations" valeur={d.plan.total} />
            <Chiffre libelle="validées telles quelles" valeur={d.plan.validees} />
            <Chiffre libelle="remplacées par un autre joueur" valeur={d.plan.autreJoueur} />
            <Chiffre libelle="pas encore validées" valeur={d.plan.enAttente} />
          </Chiffres>
        )}
      </Section>

      <Section num="20" titre="Moi contre le simulateur" aide="Picks du bac à sable du simulateur comparés à tes vrais picks, emplacement par emplacement.">
        {d.simulateur.emplacements === 0 ? (
          <Vide>Aucun pick simulé qui corresponde à un vrai pick.</Vide>
        ) : (
          <>
          {d.simulateur.identiques === d.simulateur.emplacements && (
            <p className="text-xs text-zinc-600">
              Le bac à sable est recopié depuis les vrais picks : aucune différence à mesurer pour l&apos;instant. Cette statistique
              s&apos;animera dès que tu testeras d&apos;autres joueurs dans le simulateur.
            </p>
          )}
          <Chiffres>
            <Chiffre libelle="emplacements comparés" valeur={d.simulateur.emplacements} />
            <Chiffre libelle="même joueur" valeur={d.simulateur.identiques} />
            <Chiffre libelle="matchs joués des deux côtés" valeur={d.simulateur.decides} />
            <Chiffre libelle="vrais picks gagnés" valeur={d.simulateur.reelGagnes} />
            <Chiffre libelle="picks simulés gagnés" valeur={d.simulateur.simulesGagnes} />
          </Chiffres>
          </>
        )}
      </Section>
    </div>
  );
}
