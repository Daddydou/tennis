'use client';

import { useMemo, useState, useTransition } from 'react';
import { cleDuel, resoudreArbre, type MatchReel } from '@/lib/bracketSim';
import { sauvegarderPronosticsBracket } from './actions';
import BracketRoundPanel from './BracketRoundPanel';
import ClassementBracketPanel from './ClassementBracketPanel';
import ImportBracketPanel from './ImportBracketPanel';
import ParticipantsBracketPanel from './ParticipantsBracketPanel';
import { MOI, nomStock, type Joueur, type Participant } from './types';
import ArbreBracket, { type Marque } from '../ArbreBracket';
import { construireArbre, departParDefaut, departsPossibles } from '../arbreGeometrie';
import { teinteParticipant } from '@/lib/pastillesPicks';
import type { Player } from '@/lib/types';
import { champTexte, filtreSecondaire, pilleSelecteur } from '@/app/ui';
import { majParametreUrl } from './urlEtat';

type Onglet = 'arbre' | 'reel' | 'participants' | 'classement' | 'import';

const ONGLETS: { key: Onglet; label: string }[] = [
  { key: 'arbre', label: 'Arbre' },
  { key: 'classement', label: 'Classement & probabilités' },
  { key: 'reel', label: 'Bracket réel' },
  { key: 'participants', label: 'Bracket des participants' },
  { key: 'import', label: 'Importer' },
];

/**
 * Section Bracket du simulateur — bloc 1 (choix du tour, pilote tout le
 * reste), puis les onglets qui en sont les blocs 2/3/4 : Bracket réel
 * (cliquable, tour choisi seulement), Bracket des participants (un
 * pronostic de vainqueur par match, persisté tour par tour,
 * tn_bracket_round_picks) et Classement & probabilités. Un 4e onglet
 * (Importer) pré-remplit le bloc 3 depuis l'extracteur externe (Game
 * Tracker) — même table, toujours corrigeable à la main ensuite.
 *
 * `picksBracket` (committé, TOUS tours confondus, par stock) vit ici : le
 * bloc 4 en a besoin pour les tours au-delà du tour choisi (probabilité
 * d'avancement), pas seulement celui affiché au bloc 3.
 */
export default function SimulateurBracket({
  tournamentId,
  rounds,
  matches,
  joueurs,
  players,
  surface,
  participants,
  picksBracketInitiaux,
  roundParDefaut,
  ongletInitial,
}: {
  tournamentId: string;
  rounds: string[];
  matches: MatchReel[];
  joueurs: Record<string, Joueur>;
  /** Elo par joueur — uniquement pour la simulation Monte Carlo (onglet Classement). */
  players: Record<string, Player>;
  surface: 'hard' | 'clay' | 'grass';
  participants: Participant[];
  /** stock -> { cleDuel -> playerId }, pronostics déjà enregistrés, tous tours confondus. */
  picksBracketInitiaux: Record<string, Record<string, string>>;
  roundParDefaut: string;
  /** Sous-vue lue dans l'URL (?vue=classement|reel|participants|import). */
  ongletInitial?: string;
}) {
  const stocks = useMemo(() => [MOI, ...participants.map((p) => p.id)], [participants]);

  const [roundChoisi, setRoundChoisi] = useState(roundParDefaut);
  const [onglet, setOnglet] = useState<Onglet>(
    ONGLETS.some((o) => o.key === ongletInitial) ? (ongletInitial as Onglet) : 'arbre',
  );
  // Une fois l'onglet Classement ouvert, il reste monté (masqué en CSS) même
  // en le quittant : sa simulation Monte Carlo (useMemo, ~150-300 ms mesurés)
  // ne doit pas être relancée à chaque aller-retour d'onglet. Avant sa
  // première ouverture, en revanche, il ne calcule rien pour rien — un
  // visiteur qui ne l'ouvre jamais ne paie donc jamais ce coût.
  const [classementOuvert, setClassementOuvert] = useState(onglet === 'classement');
  // Bloc 2 : vainqueurs cliqués dans le bracket réel — remis à zéro à chaque
  // changement de tour (bloc 1), puisque seul le tour affiché est simulé.
  const [scenario, setScenario] = useState<Map<string, string>>(new Map());
  const [picksBracket, setPicksBracket] = useState<Record<string, Map<string, string>>>(() => {
    const out: Record<string, Map<string, string>> = {};
    for (const s of stocks) out[s] = new Map(Object.entries(picksBracketInitiaux[s] ?? {}));
    return out;
  });
  const [pending, startTransition] = useTransition();

  const arbreScenario = useMemo(
    () => resoudreArbre(matches, rounds, (r, p) => scenario.get(cleDuel(r, p)) ?? null),
    [matches, rounds, scenario],
  );

  // Arbre (vue par défaut) : le tableau RÉEL — résultats joués seulement, sans
  // les clics hypothétiques du bloc 2 — des quarts (par défaut) à la finale,
  // avec sous chaque joueur les participants qui l'ont choisi pour ce match.
  const arbreReel = useMemo(() => resoudreArbre(matches, rounds, () => null), [matches, rounds]);
  const duelsArbre = useMemo(
    () => arbreReel.duels.map((d) => ({ round: d.round, position: d.position, a: d.a, b: d.b, vainqueur: d.vainqueur })),
    [arbreReel],
  );
  const departs = useMemo(() => departsPossibles(rounds, duelsArbre), [rounds, duelsArbre]);
  const [depuis, setDepuis] = useState<string | null>(() => departParDefaut(rounds, duelsArbre));
  const arbreDessine = useMemo(
    () => (depuis ? construireArbre(rounds, duelsArbre, depuis) : null),
    [rounds, duelsArbre, depuis],
  );
  const legende = useMemo(
    () =>
      stocks.map((s) => {
        const nom = nomStock(s, participants);
        return { stock: s, nom, couleur: `var(--color-participant-${teinteParticipant(nom)})` };
      }),
    [stocks, participants],
  );
  const marques = useMemo(() => {
    const out: Record<string, Marque[]> = {};
    for (const { stock, nom, couleur } of legende) {
      for (const [cle, playerId] of picksBracket[stock] ?? []) {
        (out[`${cle}|${playerId}`] ??= []).push({ nom, couleur });
      }
    }
    return out;
  }, [legende, picksBracket]);

  function onChangerRound(round: string) {
    setRoundChoisi(round);
    setScenario(new Map()); // seul le tour choisi est simulé — pas de scénario reporté d'un tour à l'autre.
  }

  function onChoisirScenario(position: number, playerId: string) {
    setScenario((prev) => {
      const copie = new Map(prev);
      copie.set(cleDuel(roundChoisi, position), playerId);
      return copie;
    });
  }

  function onEffacerScenario(position: number) {
    setScenario((prev) => {
      const copie = new Map(prev);
      copie.delete(cleDuel(roundChoisi, position));
      return copie;
    });
  }

  // Pronostics déjà enregistrés pour LE TOUR AFFICHÉ, position -> playerId —
  // sert de valeur initiale au brouillon du bloc 3 (remonté à chaque
  // changement de tour via sa `key`).
  const committeThisRound = useMemo(() => {
    const out: Record<string, Map<number, string>> = {};
    for (const s of stocks) {
      const out2 = new Map<number, string>();
      for (const [cle, playerId] of picksBracket[s] ?? []) {
        const [r, pos] = cle.split('|');
        if (r === roundChoisi) out2.set(Number(pos), playerId);
      }
      out[s] = out2;
    }
    return out;
  }, [stocks, picksBracket, roundChoisi]);

  async function onValiderPronostics(
    stockId: string,
    picks: { position: number; playerId: string | null }[],
  ): Promise<{ ok: boolean; error?: string }> {
    const r = await sauvegarderPronosticsBracket(
      tournamentId,
      stockId === MOI ? null : stockId,
      roundChoisi,
      picks,
    );
    if (r.ok) {
      setPicksBracket((prev) => {
        const copie = new Map(prev[stockId] ?? []);
        for (const [cle] of copie) if (cle.split('|')[0] === roundChoisi) copie.delete(cle);
        for (const p of picks) if (p.playerId) copie.set(cleDuel(roundChoisi, p.position), p.playerId);
        return { ...prev, [stockId]: copie };
      });
    }
    return r;
  }

  function onValiderEtTransition(
    stockId: string,
    picks: { position: number; playerId: string | null }[],
  ): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      startTransition(async () => {
        resolve(await onValiderPronostics(stockId, picks));
      });
    });
  }

  // Import (Game Tracker) : fusionne dans `picksBracket`, quel que soit le
  // tour affiché — un import peut couvrir plusieurs tours à la fois, déjà
  // écrits en base par la Server Action ; ceci ne fait que refléter côté
  // écran, sans recharger la page.
  function onImporte(stockId: string, picks: { round: string; position: number; playerId: string }[]) {
    setPicksBracket((prev) => {
      const copie = new Map(prev[stockId] ?? []);
      for (const p of picks) copie.set(cleDuel(p.round, p.position), p.playerId);
      return { ...prev, [stockId]: copie };
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-zinc-500" htmlFor="round-choisi">
          Tour de simulation
        </label>
        <select
          id="round-choisi"
          value={roundChoisi}
          onChange={(e) => onChangerRound(e.target.value)}
          className={champTexte}
        >
          {rounds.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">
          Le bracket réel et les pronostics des participants portent sur ce tour seulement, pas sur les suivants.
        </p>
      </div>

      <nav aria-label="Vue du jeu Bracket" className="flex flex-wrap gap-1.5 border-b border-zinc-200 pb-2">
        {ONGLETS.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={onglet === o.key}
            onClick={() => {
              setOnglet(o.key);
              majParametreUrl('vue', o.key === 'arbre' ? null : o.key);
              if (o.key === 'classement') setClassementOuvert(true);
            }}
            className={filtreSecondaire(onglet === o.key)}
          >
            {o.label}
          </button>
        ))}
      </nav>

      {onglet === 'arbre' && (
        <section aria-label="Arbre du tableau" className="space-y-4">
          {departs.length > 1 && (
            <nav aria-label="Départ de l'arbre" className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-zinc-600">Depuis :</span>
              {departs.map((r) => (
                <button key={r} type="button" aria-pressed={r === depuis} onClick={() => setDepuis(r)} className={pilleSelecteur(r === depuis)}>
                  {r}
                </button>
              ))}
            </nav>
          )}
          {arbreDessine ? (
            <>
              <ArbreBracket
                arbre={arbreDessine}
                joueurs={joueurs}
                marques={marques}
                libelle={`Tableau réel depuis le tour ${depuis}`}
                libelleVainqueur="Vainqueur"
              />
              <ul aria-label="Qui a choisi qui" className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs">
                {legende.map((l) => (
                  <li key={l.stock} className="flex items-center gap-2 text-zinc-700">
                    <span className="size-2 rounded-full" style={{ background: l.couleur }} aria-hidden="true" />
                    {l.nom}
                  </li>
                ))}
              </ul>
              <p className="text-center text-xs text-zinc-500">
                Tableau réel. Sous chaque joueur, les participants qui l&apos;ont choisi pour gagner ce match.
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">
              L&apos;arbre s&apos;affiche dès que le tableau est complet à partir des huitièmes ou des quarts.
            </p>
          )}
        </section>
      )}

      {onglet === 'reel' && (
        <BracketRoundPanel
          key={roundChoisi}
          roundChoisi={roundChoisi}
          joueurs={joueurs}
          arbre={arbreScenario}
          onChoisir={onChoisirScenario}
          onEffacer={onEffacerScenario}
        />
      )}

      {onglet === 'participants' && (
        <ParticipantsBracketPanel
          key={roundChoisi}
          roundChoisi={roundChoisi}
          matches={matches}
          rounds={rounds}
          joueurs={joueurs}
          participants={participants}
          committe={committeThisRound}
          pending={pending}
          onValider={onValiderEtTransition}
        />
      )}

      {/* Une fois ouvert, reste monté (masqué en CSS plutôt que démonté par
          `&&`) : ce panneau tire une simulation Monte Carlo coûteuse
          (`useMemo`, ~150-300 ms mesurés sur l'US Open ATP, cf. mémoire
          perf-classement-remount) — un simple aller-retour d'onglet ne doit
          pas la relancer pour rien. `classementOuvert` évite en plus de la
          lancer pour un visiteur qui n'ouvre jamais cet onglet. Les autres
          onglets, eux, réinitialisent volontairement leur brouillon à
          chaque montage (`key={roundChoisi}`) et restent donc démontés hors
          sélection — comportement voulu, inchangé. */}
      {classementOuvert && (
        <div className={onglet === 'classement' ? '' : 'hidden'}>
          <ClassementBracketPanel
            rounds={rounds}
            roundChoisi={roundChoisi}
            matches={matches}
            scenario={scenario}
            arbreScenario={arbreScenario}
            players={players}
            surface={surface}
            joueurs={joueurs}
            participants={participants}
            picksBracket={picksBracket}
          />
        </div>
      )}

      {onglet === 'import' && (
        <ImportBracketPanel tournamentId={tournamentId} participants={participants} onImporte={onImporte} />
      )}
    </div>
  );
}
