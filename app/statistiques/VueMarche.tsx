import type { ScoreSource } from '@/lib/stats/marche';
import type { DonneesVue } from './donnees';
import { Chiffre, Chiffres, Section, Tableau, Vide, nb, pct } from './composants';

type Donnees = Extract<DonneesVue, { vue: 'marche' }>;

function ligneScore({ nom, s }: { nom: string; s: ScoreSource }) {
  return [nom, s.n, pct(s.precision, 1), nb(s.brier, 3), nb(s.logLoss, 3)];
}

const EN_TETE_SCORE = ['Source', 'Matchs', 'Favori juste', 'Brier (bas = bon)', 'Log-loss (bas = bon)'];

export default function VueMarche({ d }: { d: Donnees }) {
  const h = (ms: number | null) => (ms === null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
  const dateCourte = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="space-y-4">
      <Section
        num="42"
        titre="Elo maison contre Tennis Abstract"
        aide="Les deux sources jugées sur les MÊMES matchs (ceux où chacune connaît les deux joueurs). Brier : 0,25 = pile ou face ; plus c'est bas, mieux c'est. Réserve : Elo actuel."
      >
        {d.sources.communs === 0 ? (
          <Vide>Aucun match où les deux sources connaissent les deux joueurs.</Vide>
        ) : (
          <>
            <Tableau
              colonnes={EN_TETE_SCORE}
              lignes={[ligneScore({ nom: 'Tennis Abstract', s: d.sources.ta }), ligneScore({ nom: 'Elo maison', s: d.sources.maison })]}
            />
            <p className="text-xs text-zinc-500">
              Couverture : Tennis Abstract connaît les deux joueurs sur {d.sources.couvertureTa} matchs, l&apos;Elo maison sur {d.sources.couvertureMaison}.
            </p>
          </>
        )}
      </Section>

      <Section num="43" titre="Bookmakers contre Elo" aide="Sur les matchs qui ont une cote : le moteur Elo contre la probabilité du marché (dernier relevé avant le match). Attention : l'Elo actuel connaît déjà le résultat des matchs, le marché non. L'avantage apparent de l'Elo est donc surestimé.">
        {d.contreElo.n === 0 ? (
          <Vide>Aucun match joué n&apos;a de cote enregistrée.</Vide>
        ) : (
          <>
            <Chiffres>
              <Chiffre libelle="matchs comparés" valeur={d.contreElo.n} />
              <Chiffre libelle="écart moyen de probabilité" valeur={pct(d.contreElo.ecartMoyen, 1)} />
              <Chiffre libelle="désaccords sur le favori" valeur={d.contreElo.desaccords.n} aide={`marché juste ${d.contreElo.desaccords.marcheJuste} · Elo juste ${d.contreElo.desaccords.eloJuste}`} />
            </Chiffres>
            <Tableau colonnes={EN_TETE_SCORE} lignes={[ligneScore({ nom: 'Bookmakers', s: d.contreElo.marche }), ligneScore({ nom: 'Moteur Elo', s: d.contreElo.elo })]} />
          </>
        )}
      </Section>

      <Section num="44" titre="Les cotes qui bougent" aide={`Évolution de la probabilité entre le premier et le dernier relevé d'un même duel (${d.nbDuelsCotes} duels suivis).`}>
        {d.mouvement.duels === 0 ? (
          <Vide>Il faut au moins deux relevés d&apos;un même duel, match ensuite joué.</Vide>
        ) : (
          <>
            <Chiffres>
              <Chiffre libelle="duels avec 2 relevés ou plus" valeur={d.mouvement.duels} />
              <Chiffre libelle="marché bougé vers le vainqueur" valeur={pct(d.mouvement.versLeVainqueur / d.mouvement.duels)} />
              <Chiffre libelle="variation moyenne pour le vainqueur" valeur={`${nb((d.mouvement.variationMoyenne ?? 0) * 100, 1)} pts`} />
              <Chiffre libelle="favoris battus" valeur={d.mouvement.favorisBattus.n} aide={`cote déjà reculée : ${d.mouvement.favorisBattus.marcheAvaitReculer}`} />
            </Chiffres>
          </>
        )}
      </Section>

      <Section num="45" titre="Santé de l'import" aide="Les 1 000 derniers passages du journal d'import et l'état de la surveillance automatique.">
        {d.sante === null ? (
          <Vide>Le journal d&apos;import n&apos;est affiché qu&apos;avec une session ouverte.</Vide>
        ) : d.sante.total === 0 ? (
          <Vide>Aucun passage dans le journal.</Vide>
        ) : (
          <>
            <Chiffres>
              <Chiffre libelle="passages" valeur={d.sante.total} />
              <Chiffre libelle="réussis" valeur={pct(d.sante.tauxOk)} />
              <Chiffre libelle="durée moyenne" valeur={h(d.sante.dureeMoyenneMs)} />
              <Chiffre libelle="avertissements" valeur={d.sante.avertissements} />
              <Chiffre libelle="surveillances actives" valeur={d.sante.surveillances.actives} aide={`en échec : ${d.sante.surveillances.enEchec}`} />
            </Chiffres>
            <Tableau colonnes={['Source', 'Passages', 'Réussis']} lignes={d.sante.parSource.map((s) => [s.source, s.n, s.ok])} />
            {d.sante.derniereErreur && (
              <p className="text-xs text-zinc-600">
                Dernière erreur : {d.sante.derniereErreur.tournoi}, {dateCourte(d.sante.derniereErreur.le)} — {d.sante.derniereErreur.erreur}
              </p>
            )}
            {d.sante.surveillances.arretees.length > 0 && (
              <p className="text-xs text-zinc-600">
                Surveillances arrêtées : {d.sante.surveillances.arretees.map((a) => `${a.tournoi}${a.motif ? ` (${a.motif})` : ''}`).join(', ')}.
              </p>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
