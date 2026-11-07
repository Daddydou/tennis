import { cleStock, type StockStat } from '@/lib/stats/commun';
import type { GroupeDuel } from '@/lib/stats/duel';
import type { DonneesVue } from './donnees';
import {
  Chiffre,
  Chiffres,
  CourbeCumuls,
  NomStock,
  Section,
  Tableau,
  Vide,
  classeEcart,
  classeSurface,
  libelleTour,
  nb,
  signe,
} from './composants';

type Donnees = Extract<DonneesVue, { vue: 'duel' }>;

function TableGroupes({ groupes, stocks, surface = false }: { groupes: GroupeDuel[]; stocks: StockStat[]; surface?: boolean }) {
  if (groupes.length === 0) return <Vide />;
  return (
    <Tableau
      colonnes={['', 'Tournois', ...stocks.map((s) => `${s.nom} (moy. · victoires)`)]}
      gauche={1}
      lignes={groupes.map((g) => [
        <span key="l" className={surface ? `font-medium ${classeSurface(g.libelle)}` : 'font-medium'}>
          {g.libelle}
        </span>,
        g.nbTournois,
        ...stocks.map((s) => {
          const x = g.parStock[cleStock(s.id)];
          return x.nb === 0 ? '—' : `${nb(x.moyenne, 1)} · ${x.victoires}`;
        }),
      ])}
    />
  );
}

export default function VueDuel({ d, stocks }: { d: Donnees; stocks: StockStat[] }) {
  if (d.tableau.length === 0) {
    return <Vide>Aucun point de picks ou de bracket n&apos;est encore enregistré sur cette période.</Vide>;
  }
  const nomDe = (cle: string) => stocks.find((s) => cleStock(s.id) === cle)?.nom ?? cle;
  return (
    <div className="space-y-4">
      <Section num="1" titre="Série de tournois" aide="Points (picks + bracket) de chacun, tournoi par tournoi, et courbe des points cumulés. Le vainqueur est celui qui a le plus de points sur le tournoi. Les totaux cumulés ne sont comparables que sur les tournois joués par tous : voir la matrice (#9).">
        <CourbeCumuls etiquettes={d.cumuls.etiquettes} series={d.cumuls.series} />
        <Tableau
          colonnes={['Tournoi', ...stocks.map((s) => s.nom), 'Vainqueur']}
          lignes={d.tableau.map((l) => [
            `${l.tournoi.name} (${l.tournoi.tour})`,
            ...stocks.map((s) => {
              const v = l.totaux[cleStock(s.id)];
              return v === undefined ? '—' : <span className={l.gagnants.includes(cleStock(s.id)) ? 'font-semibold text-titre' : ''}>{nb(v)}</span>;
            }),
            l.gagnants.length === 0 ? '—' : l.gagnants.map(nomDe).join(' = '),
          ])}
        />
      </Section>

      <Section num="2" titre="Régularité" aide="Points moyens par tournoi joué et écart-type : plus il est petit, plus on est constant.">
        <Tableau
          colonnes={['', 'Tournois', 'Total', 'Moyenne', 'Écart-type']}
          lignes={d.resume.map((r) => [
            <NomStock key="n" stock={{ id: r.cle === 'moi' ? null : r.cle, nom: r.nom }} />,
            r.nbTournois,
            nb(r.total),
            nb(r.moyenne, 1),
            nb(r.ecartType, 1),
          ])}
        />
      </Section>

      <Section num="3" titre="Meilleur et pire tournoi">
        <Tableau
          colonnes={['', 'Meilleur tournoi', 'Pire tournoi']}
          gauche={3}
          lignes={d.resume.map((r) => [
            <NomStock key="n" stock={{ id: r.cle === 'moi' ? null : r.cle, nom: r.nom }} />,
            r.meilleur ? `${r.meilleur.tournoi} (${nb(r.meilleur.points)})` : '—',
            r.pire ? `${r.pire.tournoi} (${nb(r.pire.points)})` : '—',
          ])}
        />
      </Section>

      <Section num="4" titre="Victoires et écart au vainqueur" aide="Écart moyen = ce qui te sépare, en points, du meilleur du tournoi (0 = tu gagnes toujours).">
        <Tableau
          colonnes={['', 'Tournois gagnés', 'Meilleure série', 'Écart moyen au vainqueur']}
          lignes={d.resume.map((r) => [
            <NomStock key="n" stock={{ id: r.cle === 'moi' ? null : r.cle, nom: r.nom }} />,
            r.victoires,
            r.meilleureSerie,
            nb(r.ecartMoyenAuVainqueur, 1),
          ])}
        />
      </Section>

      <Section num="5" titre="Par surface" aide="Points moyens par tournoi joué sur la surface, puis nombre de tournois gagnés.">
        <TableGroupes groupes={d.parSurface} stocks={stocks} surface />
      </Section>

      <Section num="6" titre="Par catégorie">
        <TableGroupes groupes={d.parCategorie} stocks={stocks} />
      </Section>

      <Section num="7" titre="ATP contre WTA">
        <TableGroupes groupes={d.parCircuit} stocks={stocks} />
      </Section>

      <Section num="8" titre="Selon le moment du tournoi" aide="Points moyens par pick à chaque tour : où gagne-t-on, au début ou en fin de tournoi ?">
        {d.parTour.length === 0 ? (
          <Vide />
        ) : (
          <Tableau
            colonnes={['Tour', ...stocks.map((s) => `${s.nom} (picks · moy.)`)]}
            lignes={d.parTour.map((l) => [
              libelleTour(l.round),
              ...stocks.map((s) => {
                const x = l.parStock[cleStock(s.id)];
                return x.nb === 0 ? '—' : `${x.nb} · ${nb(x.moyenne, 1)}`;
              }),
            ])}
          />
        )}
      </Section>

      <Section num="9" titre="Matrice des duels" aide="Sur les tournois joués par les deux : qui a fait mieux, et l'écart cumulé en points.">
        {d.matrice.length === 0 ? (
          <Vide />
        ) : (
          <Tableau
            colonnes={['Duel', 'Tournois communs', 'Victoires', 'Égalités', 'Écart cumulé']}
            lignes={d.matrice.map((m) => [
              <span key="d">
                <NomStock stock={m.a} /> – <NomStock stock={m.b} />
              </span>,
              m.communs,
              `${m.victoiresA} – ${m.victoiresB}`,
              m.egalites,
              <span key="e" className={classeEcart(m.ecartCumule)}>
                {signe(m.ecartCumule)}
              </span>,
            ])}
          />
        )}
        <Chiffres>
          <Chiffre libelle="tournois avec points" valeur={d.tableau.length} />
        </Chiffres>
      </Section>
    </div>
  );
}
