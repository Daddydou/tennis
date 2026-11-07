import type { DonneesVue } from './donnees';
import { Chiffre, Chiffres, Section, Tableau, Vide, classeEcart, nb, pct, signe } from './composants';

type Donnees = Extract<DonneesVue, { vue: 'fantasy' }>;

export default function VueFantasy({ d }: { d: Donnees }) {
  if (d.lignes.length === 0) {
    return <Vide>Aucun Fantasy terminé sur cette période : le score réel n&apos;est connu qu&apos;une fois le tournoi fini.</Vide>;
  }
  const b = d.bilan;
  return (
    <div className="space-y-4">
      <Section num="28" titre="Fantasy : prévu contre réel" aide="Score prévu quand l'équipe a été figée, contre le score réel à la fin du tournoi. Écart positif = l'équipe a fait mieux que prévu.">
        <Chiffres>
          <Chiffre libelle="Fantasy terminés" valeur={b.n} />
          <Chiffre libelle="erreur moyenne" valeur={nb(b.erreurMoyenne, 1)} aide="points" />
          <Chiffre libelle="biais" valeur={<span className={classeEcart(b.biais)}>{signe(b.biais, 1)}</span>} aide="négatif = on surestime" />
          <Chiffre libelle="réel > prévu" valeur={pct(b.partAuDessus)} />
          <Chiffre libelle="corrélation" valeur={nb(b.correlation, 2)} aide="1 = parfait" />
        </Chiffres>
        <Tableau
          colonnes={['Tournoi', 'Prévu', 'Réel', 'Écart']}
          lignes={d.lignes.map((l) => [
            l.tournoi.name,
            nb(l.predit, 1),
            nb(l.reel, 1),
            <span key="e" className={classeEcart(l.ecart)}>{signe(l.ecart, 1)}</span>,
          ])}
        />
      </Section>

      <Section num="29" titre="Le Fantasy est-il bien calibré ?" aide="Les tournois sont rangés en trois groupes d'effectif égal selon leur score prévu : le réel suit-il ?">
        {d.calibration.length === 0 ? (
          <Vide>Il faut au moins trois Fantasy terminés.</Vide>
        ) : (
          <Tableau
            colonnes={['Groupe', 'Tournois', 'Prévu moyen', 'Réel moyen']}
            lignes={d.calibration.map((t) => [t.libelle, t.n, nb(t.predit, 1), nb(t.reel, 1)])}
          />
        )}
      </Section>

      <Section num="30" titre="Impact des joueurs sans Elo" aide="Un joueur sans Elo est prévu au hasard : l'erreur est-elle plus grande quand l'équipe en contient ?">
        <Tableau
          colonnes={['Cas', 'Tournois', 'Erreur moyenne', 'Biais']}
          lignes={d.sansElo.map((g) => [g.libelle, g.n, nb(g.erreurMoyenne, 1), <span key="b" className={classeEcart(g.biais)}>{signe(g.biais, 1)}</span>])}
        />
      </Section>

      <Section num="31" titre="Équipe d'avant et d'après" aide="Quand l'équipe a changé en cours de route : le score réel de la nouvelle équipe contre celui qu'aurait fait l'ancienne.">
        {d.avantApres.n === 0 ? (
          <Vide>Aucun changement d&apos;équipe enregistré.</Vide>
        ) : (
          <Chiffres>
            <Chiffre libelle="équipes changées" valeur={d.avantApres.n} />
            <Chiffre libelle="mieux après" valeur={d.avantApres.meilleureApres} />
            <Chiffre libelle="moins bien après" valeur={d.avantApres.moinsBonneApres} />
            <Chiffre libelle="égales" valeur={d.avantApres.egales} />
            <Chiffre libelle="gain moyen" valeur={<span className={classeEcart(d.avantApres.gainMoyen)}>{signe(d.avantApres.gainMoyen, 1)}</span>} aide="points" />
          </Chiffres>
        )}
      </Section>
    </div>
  );
}
