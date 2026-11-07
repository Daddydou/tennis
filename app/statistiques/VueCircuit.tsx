import type { LigneFormat, MatchRemarquable } from '@/lib/stats/circuit';
import type { DonneesVue } from './donnees';
import { Chiffre, Chiffres, Section, Tableau, TauxBarre, Vide, classeSurface, libelleTour, nb, pct } from './composants';

type Donnees = Extract<DonneesVue, { vue: 'circuit' }>;

function TableFormats({ lignes, surface = false }: { lignes: LigneFormat[]; surface?: boolean }) {
  if (lignes.length === 0) return <Vide />;
  return (
    <Tableau
      colonnes={['', 'Matchs', 'Menés au bout des sets', 'Jeux par match']}
      lignes={lignes.map((l) => [
        <span key="l" className={surface ? `font-medium ${classeSurface(l.libelle)}` : 'font-medium'}>{l.libelle}</span>,
        l.matchs,
        <TauxBarre key="t" valeur={l.part} />,
        nb(l.jeuxMoyens, 1),
      ])}
    />
  );
}

function ListeMatchs({ liste }: { liste: MatchRemarquable[] }) {
  if (liste.length === 0) return <Vide />;
  return (
    <ul className="space-y-1 text-sm">
      {liste.map((m, i) => (
        <li key={i} className="flex flex-wrap justify-between gap-x-2">
          <span>
            <span className="font-medium">{m.vainqueur}</span> bat {m.perdant}{' '}
            <span className="text-zinc-500">{m.tournoi} · {libelleTour(m.round)}</span>
          </span>
          <span className="shrink-0 tabular-nums text-zinc-600">{m.score} ({m.jeux} jeux)</span>
        </li>
      ))}
    </ul>
  );
}

export default function VueCircuit({ d }: { d: Donnees }) {
  if (d.nbMatchs === 0) return <Vide>Aucun match sur cette période.</Vide>;
  const s = d.surprises;
  return (
    <div className="space-y-4">
      <Section num="32" titre="Les surprises de la saison" aide="Matchs gagnés par le joueur que le moteur Elo donnait perdant. Réserve : l'Elo est celui d'aujourd'hui.">
        <Chiffres>
          <Chiffre libelle="matchs analysés" valeur={s.analyses} />
          <Chiffre libelle="victoires du favori Elo" valeur={pct(s.analyses === 0 ? null : s.victoiresFavori / s.analyses)} />
        </Chiffres>
        {s.top.length === 0 ? (
          <Vide />
        ) : (
          <ul className="space-y-1 text-sm">
            {s.top.map((x, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-x-2">
                <span>
                  <span className="font-medium">{x.vainqueur}</span> bat {x.perdant}{' '}
                  <span className="text-zinc-500">{x.tournoi} · {libelleTour(x.round)}</span>
                </span>
                <span className="shrink-0 tabular-nums text-zinc-600">{x.score} · {pct(x.pVainqueur)} de chances</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section num="33" titre="Les surprises, tour par tour" aide="Part des matchs gagnés par l'outsider. Le premier tour est-il le plus imprévisible ?">
        <Tableau colonnes={['Tour', 'Matchs', 'Surprises', 'Part']} lignes={s.parTour.map((t) => [libelleTour(t.round), t.n, t.surprises, <TauxBarre key="p" valeur={t.part} />])} />
      </Section>

      <Section num="34" titre="Où tombent les favoris" aide="Les quatre meilleurs Elo de chaque tableau : jusqu'où vont-ils ?">
        {d.favoris.nbFavoris === 0 ? (
          <Vide />
        ) : (
          <Tableau colonnes={['Sortie', 'Favoris']} lignes={d.favoris.repartition.map((r) => [r.etape, r.n])} />
        )}
      </Section>

      <Section num="35" titre="Matchs menés au bout des sets" aide="3e set en deux sets gagnants, 5e en cinq. Les abandons sont exclus.">
        <p className="text-xs font-medium text-zinc-600">Par catégorie</p>
        <TableFormats lignes={d.formatsCategorie} />
        <p className="text-xs font-medium text-zinc-600">Par surface</p>
        <TableFormats lignes={d.formatsSurface} surface />
        <p className="text-xs font-medium text-zinc-600">Par circuit</p>
        <TableFormats lignes={d.formatsCircuit} />
      </Section>

      <Section num="36" titre="Tie-breaks" aide="Sets terminés 7-6 : part des sets, et les joueurs qui les gagnent (au moins 3 tie-breaks joués).">
        <Chiffres>
          <Chiffre libelle="sets joués" valeur={d.tieBreaks.sets} />
          <Chiffre libelle="tie-breaks" valeur={d.tieBreaks.tieBreaks} aide={pct(d.tieBreaks.sets === 0 ? null : d.tieBreaks.tieBreaks / d.tieBreaks.sets, 1)} />
        </Chiffres>
        {d.tieBreaks.top.length === 0 ? (
          <Vide />
        ) : (
          <Tableau colonnes={['Joueur', 'Gagnés', 'Joués', 'Taux']} lignes={d.tieBreaks.top.map((t) => [t.joueur, t.gagnes, t.joues, <TauxBarre key="t" valeur={t.taux} />])} />
        )}
      </Section>

      <Section num="37" titre="Abandons et forfaits">
        <Chiffres>
          <Chiffre libelle="abandons en cours de match" valeur={d.abandons.abandons} />
          <Chiffre libelle="forfaits" valeur={d.abandons.forfaits} />
        </Chiffres>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-zinc-500">Par tournoi</p>
            {d.abandons.parTournoi.length === 0 ? <Vide /> : <Tableau colonnes={['Tournoi', 'Aband.', 'Forf.']} lignes={d.abandons.parTournoi.map((t) => [t.tournoi, t.abandons, t.forfaits])} />}
          </div>
          <div>
            <p className="mb-1 text-xs text-zinc-500">Par joueur (celui qui a abandonné ou déclaré forfait)</p>
            {d.abandons.parJoueur.length === 0 ? <Vide /> : <Tableau colonnes={['Joueur', 'Fois']} lignes={d.abandons.parJoueur.map((j) => [j.joueur, j.n])} />}
          </div>
        </div>
        <Tableau
          colonnes={['Surface', 'Matchs', 'Abandons', 'Forfaits']}
          lignes={d.abandons.parSurface.map((x) => [
            <span key="s" className={`font-medium ${classeSurface(x.surface === 'hard' ? 'Dur' : x.surface === 'clay' ? 'Terre battue' : x.surface === 'grass' ? 'Gazon' : '')}`}>
              {x.surface === 'hard' ? 'Dur' : x.surface === 'clay' ? 'Terre battue' : x.surface === 'grass' ? 'Gazon' : x.surface}
            </span>,
            x.matchs,
            x.abandons,
            x.forfaits,
          ])}
        />
      </Section>

      <Section num="38" titre="Spécialistes et polyvalents de surface" aide="Écart entre la meilleure et la pire surface d'Elo (au moins 4 matchs dans nos tournois, Elo Tennis Abstract seulement).">
        {d.surfaces.specialistes.length === 0 ? (
          <Vide />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { titre: 'Les plus spécialisés', liste: d.surfaces.specialistes },
              { titre: 'Les plus polyvalents', liste: d.surfaces.polyvalents },
            ].map((b) => (
              <div key={b.titre}>
                <p className="mb-1 text-xs text-zinc-500">{b.titre}</p>
                <Tableau
                  colonnes={['Joueur', 'Écart', 'Meilleure']}
                  lignes={b.liste.map((p) => [p.joueur, nb(p.ecart), p.meilleure === 'dur' ? 'Dur' : p.meilleure === 'terre' ? 'Terre' : 'Gazon'])}
                />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section num="39" titre="Les pays" aide="Victoires et défaites des joueurs de chaque pays dans nos tournois.">
        {d.pays.length === 0 ? <Vide /> : <Tableau colonnes={['Pays', 'Victoires', 'Défaites', 'Taux']} lignes={d.pays.map((p) => [p.pays, p.victoires, p.defaites, <TauxBarre key="t" valeur={p.taux} />])} />}
      </Section>

      <Section num="40" titre="Les parcours les plus longs" aide="Jeux disputés par un joueur au cours d'un même tournoi (la fatigue accumulée).">
        {d.parcours.length === 0 ? <Vide /> : <Tableau colonnes={['Joueur', 'Tournoi', 'Matchs', 'Sets', 'Jeux']} gauche={2} lignes={d.parcours.map((p) => [p.joueur, p.tournoi, p.matchs, p.sets, p.jeux])} />}
      </Section>

      <Section num="41" titre="Marathons, matchs serrés et roues de bicyclette">
        <Chiffres>
          <Chiffre libelle="sets 6-0" valeur={d.remarquables.roues} />
          <Chiffre libelle="matchs gagnés 6-0 6-0" valeur={d.remarquables.matchsBlancs} />
        </Chiffres>
        <p className="text-xs font-medium text-zinc-600">Les plus longs (jeux)</p>
        <ListeMatchs liste={d.remarquables.marathons} />
        <p className="text-xs font-medium text-zinc-600">Les plus serrés (peu d&apos;écart de jeux, au moins 3 sets)</p>
        <ListeMatchs liste={d.remarquables.serres} />
        {d.remarquables.joueursAvecRoues.length > 0 && (
          <>
            <p className="text-xs font-medium text-zinc-600">Ceux qui donnent le plus de roues</p>
            <Tableau colonnes={['Joueur', 'Sets 6-0 infligés']} lignes={d.remarquables.joueursAvecRoues.map((j) => [j.joueur, j.n])} />
          </>
        )}
      </Section>
    </div>
  );
}
