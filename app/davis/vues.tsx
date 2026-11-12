import Link from 'next/link';
import { boutonPrimaire, boutonSecondaire, carte, champTexte, couleurPoints, badgeNeutre, noteInfo, pilleSelecteur } from '@/app/ui';
import type { DonneesDavis } from '@/db/davis';
import {
  LIBELLE_MATCH,
  LIBELLE_SLOT_PICK,
  LIBELLE_STATUT_MATCH,
  LIBELLE_TOUR_DAVIS,
  MAX_BRACKET,
  ORDRES_MATCH,
  SCORES_SETS,
  SLOTS_PICK,
  STATUTS_MATCH_DAVIS,
  TOURS_DAVIS,
  bracketFerme,
  memeNation,
  nationGagnante,
  nationsPickables,
  pointsBracketRencontre,
  pointsParticipant,
  pointsPick,
  pointsPronosRencontre,
  pronosFermes,
  resultatRencontre,
  rencontreCommencee,
  tourCommence,
  tourDuSlot,
  type MatchDavis,
  type PickPays,
  type PronoBracket,
  type PronoMatch,
  type RencontreDavis,
  type SlotPick,
} from '@/lib/davis';
import { formaterDebut, isoVersParis } from '@/lib/davisDates';
import { creerTableau, enregistrerMatch, modifierRencontre, poserBracket, poserPick, poserPronos } from './actions';

/** Un participant du jeu : `cle` vaut « moi » ou l'identifiant du participant ; `id` est null pour moi. */
export interface ParticipantDavis {
  cle: string;
  id: string | null;
  nom: string;
}

const picksDe = (d: DonneesDavis, id: string | null): PickPays[] => d.picks.filter((p) => p.participantId === id);
const bracketDe = (d: DonneesDavis, id: string | null): PronoBracket[] => d.bracket.filter((b) => b.participantId === id);
const pronosDe = (d: DonneesDavis, id: string | null): PronoMatch[] => d.pronos.filter((p) => p.participantId === id);

const nationsDuTableau = (d: DonneesDavis): string[] =>
  d.rencontres
    .filter((r) => r.tour === 'QF')
    .flatMap((r) => [r.nation1, r.nation2])
    .filter((n): n is string => !!n);

const pointsTexte = (n: number | null): string => (n === null ? '–' : `${n} pt${n > 1 ? 's' : ''}`);

function Pilules({ vue, participants, actif, extra = '' }: { vue: string; participants: ParticipantDavis[]; actif: string; extra?: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Participant">
      {participants.map((p) => (
        <Link key={p.cle} href={`/davis?vue=${vue}&p=${p.cle}${extra}`} className={pilleSelecteur(p.cle === actif)}>
          {p.nom}
        </Link>
      ))}
    </div>
  );
}

function ChampParticipant({ cle }: { cle: string }) {
  return <input type="hidden" name="participant" value={cle} />;
}

/* ------------------------------------------------------------------ */
/*  Création du tableau                                                */
/* ------------------------------------------------------------------ */

export function FormCreation() {
  return (
    <section className={`${carte} space-y-3 p-4`}>
      <h2 className="text-lg font-semibold">Créer le tableau</h2>
      <p className="text-sm text-zinc-600">
        Écris les 8 nations, deux par quart, dans l’ordre du tableau : les quarts 1 et 2 forment la moitié haute, les quarts 3 et 4 la
        moitié basse. Les demies et la finale se remplissent toutes seules au fil des résultats.
      </p>
      <form action={creerTableau} className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="grid grid-cols-[4rem_1fr_1fr] items-center gap-2">
            <span className="text-sm font-medium text-zinc-600">Quart {i}</span>
            <input name={`q${i}a`} className={champTexte} placeholder="Nation 1" aria-label={`Quart ${i}, nation 1`} required />
            <input name={`q${i}b`} className={champTexte} placeholder="Nation 2" aria-label={`Quart ${i}, nation 2`} required />
          </div>
        ))}
        <button type="submit" className={boutonPrimaire}>
          Créer le tableau
        </button>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Classement                                                         */
/* ------------------------------------------------------------------ */

export function VueClassement({ donnees, participants }: { donnees: DonneesDavis; participants: ParticipantDavis[] }) {
  const lignes = participants
    .map((p) => ({ ...p, ...pointsParticipant(donnees.rencontres, picksDe(donnees, p.id), bracketDe(donnees, p.id), pronosDe(donnees, p.id)) }))
    .sort((a, b) => b.total - a.total);
  return (
    <section className={`${carte} space-y-3 p-4`}>
      <h2 className="text-lg font-semibold">Classement de la Coupe Davis</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="py-2 pr-3 font-medium">Participant</th>
              <th className="px-2 py-2 text-right font-medium">Picks</th>
              <th className="px-2 py-2 text-right font-medium">Bracket</th>
              <th className="px-2 py-2 text-right font-medium">Pronos</th>
              <th className="py-2 pl-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.cle} className="border-t border-zinc-100">
                <td className="py-2.5 pr-3 font-medium">{l.nom}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{l.picks}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{l.bracket}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{l.pronos}</td>
                <td className="py-2.5 pl-2 text-right text-base font-semibold tabular-nums">{l.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={noteInfo}>
        Le classement additionne les picks par pays, le bracket des nations (36 points au maximum) et les pronos des matchs. La Coupe
        Davis n’entre pas encore au palmarès ni dans la Race : ses mises restent à fixer.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Tableau et résultats                                               */
/* ------------------------------------------------------------------ */

function nomRencontre(r: RencontreDavis): string {
  return `${r.nation1 ?? 'À déterminer'} – ${r.nation2 ?? 'À déterminer'}`;
}

function resumeRencontre(r: RencontreDavis): string {
  const res = resultatRencontre(r);
  if (res.gagnant !== null) return `${nationGagnante(r)} gagne ${res.score}`;
  const [a, b] = res.victoires;
  return a + b > 0 ? `${a}-${b}` : 'À venir';
}

function scoreAffiche(m: MatchDavis): string {
  if (m.statut === 'forfait') return 'forfait';
  const sets = m.sets.map((s) => `${s.g1}-${s.g2}`).join(' ');
  return m.statut === 'abandon' ? `${sets} (abandon)` : sets;
}

function FormMatch({ r, m }: { r: RencontreDavis; m: MatchDavis }) {
  // Le score se saisit du point de vue du vainqueur : on le reconstitue ainsi pour préremplir.
  const scoreVainqueur =
    m.gagnant === null ? m.sets.map((s) => `${s.g1}-${s.g2}`).join(' ') : m.sets.map((s) => (m.gagnant === 1 ? `${s.g1}-${s.g2}` : `${s.g2}-${s.g1}`)).join(' ');
  return (
    <form action={enregistrerMatch} className="space-y-2 border-t border-zinc-100 pt-3">
      <input type="hidden" name="rencontre" value={r.id} />
      <input type="hidden" name="ordre" value={m.ordre} />
      <p className="text-sm font-medium">{LIBELLE_MATCH[m.ordre]}</p>
      <div className="grid grid-cols-2 gap-2">
        <input name="joueur1" defaultValue={m.joueur1 ?? ''} className={champTexte} placeholder={`Joueur ${r.nation1 ?? ''}`} aria-label={`${LIBELLE_MATCH[m.ordre]} : joueur de ${r.nation1 ?? 'la nation 1'}`} />
        <input name="joueur2" defaultValue={m.joueur2 ?? ''} className={champTexte} placeholder={`Joueur ${r.nation2 ?? ''}`} aria-label={`${LIBELLE_MATCH[m.ordre]} : joueur de ${r.nation2 ?? 'la nation 2'}`} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select name="statut" defaultValue={m.statut} className={champTexte} aria-label={`${LIBELLE_MATCH[m.ordre]} : statut`}>
          {STATUTS_MATCH_DAVIS.map((s) => (
            <option key={s} value={s}>
              {LIBELLE_STATUT_MATCH[s]}
            </option>
          ))}
        </select>
        <select name="gagnant" defaultValue={m.gagnant ?? ''} className={champTexte} aria-label={`${LIBELLE_MATCH[m.ordre]} : vainqueur`}>
          <option value="">Vainqueur : aucun</option>
          <option value="1">{r.nation1}</option>
          <option value="2">{r.nation2}</option>
        </select>
      </div>
      <input
        name="score"
        defaultValue={scoreVainqueur}
        className={`${champTexte} w-full`}
        placeholder="Score du vainqueur : 6-4 3-6 7-6(5)"
        aria-label={`${LIBELLE_MATCH[m.ordre]} : score écrit du point de vue du vainqueur`}
      />
      <button type="submit" className={boutonSecondaire}>
        Enregistrer le {LIBELLE_MATCH[m.ordre].toLowerCase()}
      </button>
    </form>
  );
}

function CarteRencontre({ r, maintenant }: { r: RencontreDavis; maintenant: Date }) {
  const prete = !!r.nation1 && !!r.nation2;
  return (
    <article className={`${carte} space-y-3 p-4`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{nomRencontre(r)}</h3>
          <p className="text-sm text-zinc-600">{formaterDebut(r.debut)}</p>
        </div>
        <span className={`${badgeNeutre} min-h-7`}>{resumeRencontre(r)}</span>
      </header>
      {prete && (
        <ul className="space-y-1.5 text-sm">
          {r.matchs.map((m) => (
            <li key={m.ordre} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>
                <span className="font-medium">{LIBELLE_MATCH[m.ordre]}</span>
                {(m.joueur1 || m.joueur2) && (
                  <span className="text-zinc-600">
                    {' '}
                    · {m.joueur1 ?? '?'} – {m.joueur2 ?? '?'}
                  </span>
                )}
              </span>
              <span className="tabular-nums text-zinc-700">
                {m.gagnant !== null
                  ? `${m.gagnant === 1 ? r.nation1 : r.nation2} · ${scoreAffiche(m)}`
                  : LIBELLE_STATUT_MATCH[m.statut]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {rencontreCommencee(r, maintenant) && <p className="text-xs text-zinc-500">Commencée : picks et pronos de cette rencontre sont fermés pour moi.</p>}
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent">Saisir ou corriger</summary>
        <div className="space-y-3 pt-2">
          <form action={modifierRencontre} className="space-y-2">
            <input type="hidden" name="rencontre" value={r.id} />
            {r.tour === 'QF' && (
              <div className="grid grid-cols-2 gap-2">
                <input name="nation1" defaultValue={r.nation1 ?? ''} className={champTexte} aria-label="Nation 1" />
                <input name="nation2" defaultValue={r.nation2 ?? ''} className={champTexte} aria-label="Nation 2" />
              </div>
            )}
            <label className="block text-sm text-zinc-600">
              Début de la rencontre (heure de Paris)
              <input type="datetime-local" name="debut" defaultValue={isoVersParis(r.debut)} className={`${champTexte} mt-1 block w-full`} />
            </label>
            <button type="submit" className={boutonSecondaire}>
              Enregistrer la rencontre
            </button>
          </form>
          {prete ? (
            r.matchs.map((m) => <FormMatch key={m.ordre} r={r} m={m} />)
          ) : (
            <p className={noteInfo}>Les deux nations ne sont pas encore connues : elles arrivent avec les résultats du tour précédent.</p>
          )}
        </div>
      </details>
    </article>
  );
}

export function VueTableau({ donnees, maintenant }: { donnees: DonneesDavis; maintenant: Date }) {
  return (
    <div className="space-y-5">
      {TOURS_DAVIS.map((tour) => (
        <section key={tour} className="space-y-2.5">
          <h2 className="text-sm font-semibold">{LIBELLE_TOUR_DAVIS[tour]}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {donnees.rencontres
              .filter((r) => r.tour === tour)
              .map((r) => (
                <CarteRencontre key={r.id} r={r} maintenant={maintenant} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Picks par pays                                                     */
/* ------------------------------------------------------------------ */

export function VuePicks({ donnees, participants, actif, maintenant }: { donnees: DonneesDavis; participants: ParticipantDavis[]; actif: string; maintenant: Date }) {
  const p = participants.find((x) => x.cle === actif) ?? participants[0];
  const siens = picksDe(donnees, p.id);
  return (
    <section className="space-y-3">
      <Pilules vue="picks" participants={participants} actif={p.cle} />
      <p className={noteInfo}>
        Un pays par moitié du tableau en quart, un en demie, un en finale. Un pays ne se pique qu’une fois sur la compétition ; chaque tour
        ferme à sa première rencontre.
        {p.id !== null && ' Pour les autres, recopie ici leurs picks une fois dévoilés : la fermeture ne s’applique qu’à moi.'}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {SLOTS_PICK.map((slot: SlotPick) => {
          const pick = siens.find((x) => x.slot === slot);
          const ferme = p.id === null && tourCommence(donnees.rencontres, tourDuSlot(slot), maintenant);
          const choix = nationsPickables(donnees.rencontres, slot);
          const pris = siens.filter((x) => x.slot !== slot).map((x) => x.nation);
          const points = pick ? pointsPick(donnees.rencontres, pick) : null;
          return (
            <article key={slot} className={`${carte} space-y-2 p-4`}>
              <h3 className="text-base font-semibold">{LIBELLE_SLOT_PICK[slot]}</h3>
              <p className="text-sm">
                {pick ? <span className="font-medium">{pick.nation}</span> : <span className="text-zinc-500">Pas de pick</span>}
                {pick && <span className={`ml-2 font-semibold tabular-nums ${couleurPoints(points)}`}>{pointsTexte(points)}</span>}
              </p>
              {ferme ? (
                <p className="text-xs text-zinc-500">Tour fermé.</p>
              ) : choix.length === 0 ? (
                <p className="text-xs text-zinc-500">Les nations de ce tour ne sont pas encore connues.</p>
              ) : (
                <form action={poserPick} className="flex flex-wrap gap-2">
                  <ChampParticipant cle={p.cle} />
                  <input type="hidden" name="slot" value={slot} />
                  <select name="nation" defaultValue={pick?.nation ?? ''} className={`${champTexte} min-w-40 flex-1`} aria-label={`Pays pour ${LIBELLE_SLOT_PICK[slot]}`}>
                    <option value="">Aucun pick</option>
                    {choix.map((n) => (
                      <option key={n} value={n} disabled={pris.some((x) => memeNation(x, n))}>
                        {n}
                        {pris.some((x) => memeNation(x, n)) ? ' (déjà pris)' : ''}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={boutonPrimaire}>
                    Valider
                  </button>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Bracket des nations                                                */
/* ------------------------------------------------------------------ */

export function VueBracket({ donnees, participants, actif, maintenant }: { donnees: DonneesDavis; participants: ParticipantDavis[]; actif: string; maintenant: Date }) {
  const p = participants.find((x) => x.cle === actif) ?? participants[0];
  const siens = bracketDe(donnees, p.id);
  const ferme = p.id === null && bracketFerme(donnees.rencontres, maintenant);
  const toutes = nationsDuTableau(donnees);
  const total = donnees.rencontres.reduce((somme, r) => {
    const prono = siens.find((b) => b.tour === r.tour && b.position === r.position);
    return somme + (prono ? (pointsBracketRencontre(prono, r)?.total ?? 0) : 0);
  }, 0);
  return (
    <section className="space-y-3">
      <Pilules vue="bracket" participants={participants} actif={p.cle} />
      <p className={noteInfo}>
        Avant le premier quart, choisis la nation gagnante de chaque rencontre et le score (2-0 ou 2-1). Nation juste : 2 pts en quart, 4 en
        demie, 8 en finale ; bon score en plus : +1, +2, +4 (le score ne compte qu’avec la bonne nation). {MAX_BRACKET} points au maximum.
        Les demies et la finale se remplissent avec tes propres vainqueurs du tour précédent.
      </p>
      <form action={poserBracket} className={`${carte} space-y-3 p-4`}>
        <ChampParticipant cle={p.cle} />
        {TOURS_DAVIS.map((tour) => (
          <div key={tour} className="space-y-2">
            <h3 className="text-sm font-semibold">{LIBELLE_TOUR_DAVIS[tour]}</h3>
            {donnees.rencontres
              .filter((r) => r.tour === tour)
              .map((r) => {
                const prono = siens.find((b) => b.tour === r.tour && b.position === r.position);
                const pts = prono ? pointsBracketRencontre(prono, r) : null;
                const options = r.tour === 'QF' ? [r.nation1, r.nation2].filter((n): n is string => !!n) : toutes;
                return (
                  <div key={r.id} className="grid grid-cols-[1fr_6rem_4rem] items-center gap-2">
                    <div className="min-w-0">
                      <select name={`nation-${r.tour}-${r.position}`} defaultValue={prono?.nation ?? ''} disabled={ferme} className={`${champTexte} w-full`} aria-label={`${LIBELLE_TOUR_DAVIS[tour]} ${r.position} : nation gagnante`}>
                        <option value="">{r.tour === 'QF' ? nomRencontre(r) : `${LIBELLE_TOUR_DAVIS[tour]} ${r.position}`}</option>
                        {options.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <select name={`score-${r.tour}-${r.position}`} defaultValue={prono?.score ?? ''} disabled={ferme} className={champTexte} aria-label={`${LIBELLE_TOUR_DAVIS[tour]} ${r.position} : score`}>
                      <option value="">Score</option>
                      {SCORES_SETS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <span className={`text-right text-sm font-semibold tabular-nums ${couleurPoints(pts?.total ?? null)}`}>{pts ? pointsTexte(pts.total) : ''}</span>
                  </div>
                );
              })}
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {ferme ? <p className="text-sm text-zinc-600">Bracket fermé : le premier quart a commencé.</p> : (
            <button type="submit" className={boutonPrimaire}>
              Enregistrer le bracket
            </button>
          )}
          <p className="text-sm font-semibold tabular-nums">Total bracket : {total}</p>
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Pronos des matchs                                                  */
/* ------------------------------------------------------------------ */

export function VuePronos({ donnees, participants, actif, maintenant }: { donnees: DonneesDavis; participants: ParticipantDavis[]; actif: string; maintenant: Date }) {
  const p = participants.find((x) => x.cle === actif) ?? participants[0];
  const pretes = donnees.rencontres.filter((r) => r.nation1 && r.nation2);
  return (
    <section className="space-y-3">
      <Pilules vue="pronos" participants={participants} actif={p.cle} />
      <p className={noteInfo}>
        Dès que les deux nations d’une rencontre sont connues, pronostique ses trois matchs : nation gagnante et score en sets. Bonne nation 2
        pts, bon score +1, carton plein +2 ; le tout × 1 en quart, × 2 en demie, × 3 en finale. Un double pas joué ne compte pas ; sur un
        forfait ou un abandon, seul le vainqueur compte. Les pronos ferment au début de la rencontre, ceux des autres se dévoilent alors.
      </p>
      {pretes.length === 0 && <p className="text-sm text-zinc-600">Aucune rencontre n’a encore ses deux nations.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {pretes.map((r) => {
          const siens = pronosDe(donnees, p.id).filter((x) => x.rencontreId === r.id);
          const ferme = p.id === null && pronosFermes(r, maintenant);
          const points = pointsPronosRencontre(siens, r);
          const devoile = rencontreCommencee(r, maintenant);
          return (
            <article key={r.id} className={`${carte} space-y-3 p-4`}>
              <header className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">{nomRencontre(r)}</h3>
                  <p className="text-sm text-zinc-600">
                    {LIBELLE_TOUR_DAVIS[r.tour]} · {formaterDebut(r.debut)}
                  </p>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${couleurPoints(points.details.length > 0 ? points.total : null)}`}>
                  {points.details.length > 0 ? pointsTexte(points.total) : ''}
                </span>
              </header>
              <form action={poserPronos} className="space-y-2">
                <ChampParticipant cle={p.cle} />
                <input type="hidden" name="rencontre" value={r.id} />
                {ORDRES_MATCH.map((ordre) => {
                  const prono = siens.find((x) => x.ordre === ordre);
                  return (
                    <div key={ordre} className="grid grid-cols-[4.5rem_1fr_5rem] items-center gap-2">
                      <span className="text-sm font-medium">{LIBELLE_MATCH[ordre]}</span>
                      <select name={`nation-${ordre}`} defaultValue={prono?.nation ?? ''} disabled={ferme} className={champTexte} aria-label={`${LIBELLE_MATCH[ordre]} : nation gagnante`}>
                        <option value="">Nation</option>
                        <option value={r.nation1 ?? ''}>{r.nation1}</option>
                        <option value={r.nation2 ?? ''}>{r.nation2}</option>
                      </select>
                      <select name={`sets-${ordre}`} defaultValue={prono?.sets ?? ''} disabled={ferme} className={champTexte} aria-label={`${LIBELLE_MATCH[ordre]} : score en sets`}>
                        <option value="">Sets</option>
                        {SCORES_SETS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                {ferme ? (
                  <p className="text-xs text-zinc-500">Pronos fermés : la rencontre a commencé.</p>
                ) : (
                  <button type="submit" className={boutonPrimaire}>
                    Enregistrer les pronos
                  </button>
                )}
              </form>
              {points.carton && <p className="text-xs font-medium text-juste">Carton plein (+2)</p>}
              {devoile && (
                <div className="space-y-1 border-t border-zinc-100 pt-3 text-sm">
                  <p className="font-medium">Pronos dévoilés</p>
                  {participants.map((q) => {
                    const leurs = pronosDe(donnees, q.id).filter((x) => x.rencontreId === r.id);
                    const pts = pointsPronosRencontre(leurs, r);
                    return (
                      <p key={q.cle} className="flex flex-wrap justify-between gap-x-3 text-zinc-700">
                        <span>
                          <span className="font-medium">{q.nom}</span>{' '}
                          {leurs.length === 0
                            ? 'aucun prono'
                            : ORDRES_MATCH.map((o) => {
                                const x = leurs.find((y) => y.ordre === o);
                                return x ? `${LIBELLE_MATCH[o]} ${x.nation} ${x.sets}` : null;
                              })
                                .filter(Boolean)
                                .join(' · ')}
                        </span>
                        <span className="font-semibold tabular-nums">{pts.details.length > 0 ? pointsTexte(pts.total) : ''}</span>
                      </p>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
