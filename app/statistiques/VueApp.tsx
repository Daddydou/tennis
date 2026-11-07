import { formaterAge } from '@/lib/stats/appli';
import type { DonneesVue } from './donnees';
import { Chiffre, Chiffres, Section, Tableau, nb } from './composants';

type Donnees = Extract<DonneesVue, { vue: 'app' }>;

const LIBELLE_STATUT: Record<string, string> = {
  upcoming: 'à venir',
  running: 'en cours',
  completed: 'terminés',
};

const PASTILLE: Record<string, string> = {
  frais: 'bg-zinc-100 text-juste',
  moyen: 'bg-zinc-100 text-zinc-700',
  ancien: 'bg-zinc-100 text-rate',
  vide: 'bg-zinc-100 text-zinc-500',
};

const LIBELLE_NIVEAU: Record<string, string> = {
  frais: 'à jour',
  moyen: 'moins de 7 jours',
  ancien: 'ancien',
  vide: 'aucune donnée',
};

export default function VueApp({ d }: { d: Donnees }) {
  return (
    <div className="space-y-4">
      <Section num="46" titre="Compteurs" aide="Tout ce que contient la base, tous tournois confondus.">
        <Chiffres>
          {d.compteurs.map((c) => (
            <Chiffre key={c.libelle} libelle={c.libelle} valeur={nb(c.valeur)} />
          ))}
        </Chiffres>
        <p className="text-xs text-zinc-500">
          Sur la période choisie : {d.nbTournoisParStatut.map((s) => `${s.n} ${LIBELLE_STATUT[s.statut] ?? s.statut}`).join(' · ')}.
        </p>
      </Section>

      <Section num="47" titre="Fraîcheur des données" aide="Date de la dernière écriture pour chaque source. Une source sans date n'est jamais comptée comme à jour.">
        <Tableau
          colonnes={['Source', 'Dernière mise à jour', 'État']}
          lignes={d.fraicheurs.map((f) => [
            f.libelle,
            f.dernier ? `${new Date(f.dernier).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${formaterAge(f.ageHeures)}` : '—',
            <span key="n" className={`inline-flex rounded-md px-1.5 text-xs font-medium ${PASTILLE[f.niveau]}`}>
              {LIBELLE_NIVEAU[f.niveau]}
            </span>,
          ])}
        />
      </Section>
    </div>
  );
}
