import { cleStock, type StockStat } from '@/lib/stats/commun';
import type { DonneesVue } from './donnees';
import { Chiffre, Chiffres, NomStock, Section, Tableau, TauxBarre, Vide, classeEcart, libelleTour, nb, pct, signe } from './composants';

type Donnees = Extract<DonneesVue, { vue: 'bracket' }>;

export default function VueBracket({ d, stocks }: { d: Donnees; stocks: StockStat[] }) {
  if (d.nbPronostics === 0) return <Vide>Aucun pronostic de bracket sur cette période.</Vide>;
  const cles = stocks.map((s) => cleStock(s.id));
  return (
    <div className="space-y-4">
      <Section num="21" titre="Précision du bracket, par tour" aide="Part des cases du tableau où le vainqueur annoncé est le vainqueur réel (matchs joués seulement).">
        {d.precision.parTour.length === 0 ? (
          <Vide />
        ) : (
          <Tableau
            colonnes={['Tour', ...stocks.map((s) => s.nom)]}
            lignes={[
              ...d.precision.parTour.map((t) => [
                libelleTour(t.round),
                ...cles.map((c) => {
                  const x = t.parStock[c];
                  return x.n === 0 ? '—' : <span key={c}>{pct(x.taux)} <span className="text-xs text-zinc-500">({x.justes}/{x.n})</span></span>;
                }),
              ]),
              [
                <span key="t" className="font-semibold">Tous les tours</span>,
                ...cles.map((c) => {
                  const x = d.precision.total[c];
                  return x.n === 0 ? '—' : <span key={c} className="font-semibold">{pct(x.taux)} <span className="text-xs font-normal text-zinc-500">({x.justes}/{x.n})</span></span>;
                }),
              ],
            ]}
          />
        )}
      </Section>

      <Section num="22" titre="Le champion prédit" aide="Tournois dont la finale est jouée et où tu avais pronostiqué la finale.">
        <Tableau
          colonnes={['', 'Tournois évalués', 'Champions trouvés', 'Taux']}
          lignes={d.champions.map((r) => [
            <NomStock key="n" stock={{ id: r.cle === 'moi' ? null : r.cle, nom: r.nom }} />,
            r.champions.evalues,
            r.champions.trouves,
            pct(r.champions.evalues === 0 ? null : r.champions.trouves / r.champions.evalues),
          ])}
        />
      </Section>

      <Section num="23" titre="Les finalistes trouvés" aide="Calculé à partir des demi-finales pronostiquées : les deux vainqueurs annoncés contre les deux vrais finalistes.">
        <Tableau
          colonnes={['', 'Tournois évalués', 'Finalistes trouvés', 'Les deux trouvés']}
          lignes={d.champions.map((r) => [
            <NomStock key="n" stock={{ id: r.cle === 'moi' ? null : r.cle, nom: r.nom }} />,
            r.finalistes.evalues,
            r.finalistes.evalues === 0 ? '—' : `${r.finalistes.trouves} / ${r.finalistes.evalues * 2}`,
            r.finalistes.parfaits,
          ])}
        />
      </Section>

      <Section
        num="24"
        titre="L'audace du bracket"
        aide="Outsider = joueur annoncé avec moins de 50 % de chances selon le moteur Elo. On ne compte que les cases où le joueur annoncé joue réellement le match. Réserve : Elo actuel."
      >
        <Tableau
          colonnes={['', 'Cases évaluées', 'Outsiders', 'Outsiders justes', 'Favoris justes', 'Points via outsiders']}
          lignes={d.audace.map((a) => [
            <NomStock key="n" stock={{ id: a.cle === 'moi' ? null : a.cle, nom: a.nom }} />,
            a.evaluables,
            `${a.outsiders} (${pct(a.evaluables === 0 ? null : a.outsiders / a.evaluables)})`,
            a.outsiders === 0 ? '—' : pct(a.outsidersJustes / a.outsiders),
            a.favoris === 0 ? '—' : pct(a.favorisJustes / a.favoris),
            nb(a.pointsViaOutsiders),
          ])}
        />
      </Section>

      <Section num="25" titre="Bracket contre bookmakers" aide="Sur les duels qui ont une cote : ton taux de réussite contre celui qu'aurait eu le favori du marché (dernier relevé).">
        {d.contreCotes.every((c) => c.n === 0) ? (
          <Vide>Aucun duel pronostiqué n&apos;a de cote enregistrée.</Vide>
        ) : (
          <Tableau
            colonnes={['', 'Duels avec cote', 'Tes bonnes réponses', 'Favori du marché', 'Écart']}
            lignes={d.contreCotes.map((c) => {
              const ecart = c.n === 0 ? null : (c.justes - c.favoriMarcheJustes) / c.n;
              return [
                <NomStock key="n" stock={{ id: c.cle === 'moi' ? null : c.cle, nom: c.nom }} />,
                c.n,
                c.n === 0 ? '—' : pct(c.justes / c.n),
                c.n === 0 ? '—' : pct(c.favoriMarcheJustes / c.n),
                <span key="e" className={classeEcart(ecart)}>{ecart === null ? '—' : `${signe(ecart * 100)} pts`}</span>,
              ];
            })}
          />
        )}
      </Section>

      <Section num="26" titre="Consensus contre solo" aide="Quand le groupe est d'accord, a-t-il raison ? Quand l'un est seul de son avis, qui a raison ?">
        <Chiffres>
          <Chiffre libelle="cases où tout le monde est d'accord" valeur={d.consensus.unanimes.n} />
          <Chiffre libelle="…et le groupe avait raison" valeur={d.consensus.unanimes.n === 0 ? '—' : pct(d.consensus.unanimes.justes / d.consensus.unanimes.n)} />
          <Chiffre libelle="cases à 2 contre 1" valeur={d.consensus.deuxContreUn.n} />
          <Chiffre libelle="…et la majorité avait raison" valeur={d.consensus.deuxContreUn.n === 0 ? '—' : pct(d.consensus.deuxContreUn.majoriteJuste / d.consensus.deuxContreUn.n)} />
        </Chiffres>
        <Tableau
          colonnes={['Seul de son avis', 'Fois', 'Il avait raison']}
          lignes={Object.values(d.consensus.seul).map((s) => [s.nom, s.n, s.n === 0 ? '—' : <TauxBarre key="t" valeur={s.justes / s.n} />])}
        />
      </Section>

      <Section num="27" titre="Le bracket de Thomas : ses points contre les nôtres" aide="Points affichés par l'app de Thomas comparés à ceux recalculés chez nous. Seules les différences sont listées.">
        {d.externe.compares === 0 ? (
          <Vide>Aucun bracket de Thomas synchronisé sur cette période.</Vide>
        ) : (
          <>
            <Chiffres>
              <Chiffre libelle="brackets comparés" valeur={d.externe.compares} />
              <Chiffre libelle="identiques" valeur={d.externe.identiques} />
              <Chiffre libelle="différents" valeur={d.externe.lignes.length} />
            </Chiffres>
            {d.externe.lignes.length > 0 && (
              <Tableau
                colonnes={['Tournoi', 'Pseudo', 'Chez Thomas', 'Chez nous', 'Écart']}
                gauche={2}
                lignes={d.externe.lignes.map((l) => [l.tournoi, l.pseudo, l.thomas, l.calcule, <span key="e" className={classeEcart(l.ecart)}>{signe(l.ecart)}</span>])}
              />
            )}
          </>
        )}
      </Section>
    </div>
  );
}
