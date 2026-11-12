'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sessionValide } from '@/auth/garde';
import {
  ANNEE_DAVIS,
  creerTableauDavis,
  lireDonneesDavis,
  majMatch,
  majRencontre,
  remplacerBracket,
  remplacerPick,
  remplacerPronos,
  retirerPick,
} from '@/db/davis';
import { supabaseAdmin } from '@/db/server';
import {
  ORDRES_MATCH,
  SCORES_SETS,
  SLOTS_PICK,
  STATUTS_MATCH_DAVIS,
  bracketFerme,
  doublePossible,
  memeNation,
  nationsAttendues,
  orienterSets,
  parserScore,
  pronosFermes,
  tourCommence,
  tourDuSlot,
  validerBracket,
  validerPick,
  validerResultatMatch,
  type Cote,
  type OrdreMatch,
  type PronoBracket,
  type ScoreSets,
  type SlotPick,
  type StatutMatchDavis,
} from '@/lib/davis';
import { parisVersIso } from '@/lib/davisDates';

/**
 * Server Actions de la Coupe Davis (page /davis). Chacune revérifie la session, valide avec le moteur pur
 * (lib/davis.ts), écrit via la service role puis revient sur /davis avec un message (`ok` ou `erreur`).
 *
 * Fermetures : elles ne s'appliquent qu'à MES choix (participant « moi »). Les picks, le bracket et les
 * pronos de Laki et de Thomas se recopient après coup, quand l'app de Thomas les dévoile.
 */

type Vue = 'classement' | 'tableau' | 'picks' | 'bracket' | 'pronos';
type Admin = ReturnType<typeof supabaseAdmin>;

function retour(vue: Vue, extra: Record<string, string>, message: { ok?: string; erreur?: string }): never {
  const q = new URLSearchParams({ vue, ...extra });
  if (message.erreur) q.set('erreur', message.erreur);
  else if (message.ok) q.set('ok', message.ok);
  revalidatePath('/davis');
  redirect(`/davis?${q.toString()}`);
}

async function admin(): Promise<Admin> {
  if (!(await sessionValide())) redirect('/login');
  return supabaseAdmin();
}

const texte = (f: FormData, nom: string): string => String(f.get(nom) ?? '').trim();

/** « moi » -> null ; sinon l'identifiant d'un participant existant. Null si le participant est inconnu. */
async function lireParticipant(sb: Admin, valeur: string): Promise<{ id: string | null } | null> {
  if (valeur === '' || valeur === 'moi') return { id: null };
  const { data } = await sb.from('tn_participants').select('id').eq('id', valeur).maybeSingle();
  return data ? { id: valeur } : null;
}

const paramParticipant = (id: string | null) => (id === null ? 'moi' : id);

/* ------------------------------------------------------------------ */
/*  Tableau                                                            */
/* ------------------------------------------------------------------ */

/** Crée le tableau : 4 quarts (8 nations) puis demies et finale vides. */
export async function creerTableau(f: FormData): Promise<void> {
  const sb = await admin();
  const quarts = [1, 2, 3, 4].map((i) => ({ nation1: texte(f, `q${i}a`), nation2: texte(f, `q${i}b`) }));
  const noms = quarts.flatMap((q) => [q.nation1, q.nation2]);
  if (noms.some((n) => !n)) retour('tableau', {}, { erreur: 'Renseigne les 8 nations (deux par quart).' });
  if (new Set(noms.map((n) => n.toLowerCase())).size !== 8) retour('tableau', {}, { erreur: 'Chaque nation ne peut figurer qu’une fois.' });
  const donnees = await lireDonneesDavis(sb);
  if (donnees.tablesAbsentes) retour('tableau', {}, { erreur: 'La migration 0034 n’est pas encore appliquée à la base.' });
  if (donnees.rencontres.length > 0) retour('tableau', {}, { erreur: 'Le tableau existe déjà.' });
  await creerTableauDavis(sb, ANNEE_DAVIS, quarts);
  retour('tableau', {}, { ok: 'Tableau créé.' });
}

/** Corrige les nations d'un quart (faute de frappe) et/ou fixe l'heure de début d'une rencontre. */
export async function modifierRencontre(f: FormData): Promise<void> {
  const sb = await admin();
  const id = texte(f, 'rencontre');
  const donnees = await lireDonneesDavis(sb);
  const r = donnees.rencontres.find((x) => x.id === id);
  if (!r) retour('tableau', {}, { erreur: 'Rencontre introuvable.' });
  const patch: { nation1?: string | null; nation2?: string | null; debut?: string | null } = {};
  if (r.tour === 'QF') {
    const n1 = texte(f, 'nation1');
    const n2 = texte(f, 'nation2');
    if (!n1 || !n2) retour('tableau', {}, { erreur: 'Un quart a deux nations.' });
    patch.nation1 = n1;
    patch.nation2 = n2;
  }
  const debut = texte(f, 'debut');
  if (debut === '') patch.debut = null;
  else {
    const iso = parisVersIso(debut);
    if (!iso) retour('tableau', {}, { erreur: 'Heure de début illisible.' });
    patch.debut = iso;
  }
  await majRencontre(sb, id, patch);
  retour('tableau', {}, { ok: 'Rencontre mise à jour.' });
}

/**
 * Remplit les demies et la finale d'après les rencontres décidées, et range le double : « non joué » dès que les
 * simples sont à 2-0, de nouveau « à venir » s'ils repassent à 1-1.
 */
async function synchroniserTableau(sb: Admin): Promise<void> {
  const donnees = await lireDonneesDavis(sb);
  const attendues = nationsAttendues(donnees.rencontres);
  for (const r of donnees.rencontres) {
    const att = attendues[`${r.tour}-${r.position}`];
    if (att && (r.nation1 !== att.nation1 || r.nation2 !== att.nation2)) {
      await majRencontre(sb, r.id, { nation1: att.nation1, nation2: att.nation2 });
    }
    const double = r.matchs.find((m) => m.ordre === 3);
    const simples = r.matchs.filter((m) => m.ordre !== 3);
    if (!double || simples.length < 2) continue;
    const simplesJoues = simples.every((m) => m.gagnant !== null && ['termine', 'forfait', 'abandon'].includes(m.statut));
    if (!simplesJoues) continue;
    const memeVainqueur = simples[0].gagnant === simples[1].gagnant;
    if (memeVainqueur && double.statut !== 'non_joue') {
      await majMatch(sb, r.id, 3, { joueur1: double.joueur1, joueur2: double.joueur2, statut: 'non_joue', gagnant: null, sets: [] });
    } else if (!memeVainqueur && double.statut === 'non_joue') {
      await majMatch(sb, r.id, 3, { joueur1: double.joueur1, joueur2: double.joueur2, statut: 'a_venir', gagnant: null, sets: [] });
    }
  }
}

/** Enregistre l'état d'un match : statut, vainqueur, score écrit du point de vue du vainqueur (« 6-4 3-6 6-3 »). */
export async function enregistrerMatch(f: FormData): Promise<void> {
  const sb = await admin();
  const rencontreId = texte(f, 'rencontre');
  const ordre = Number(texte(f, 'ordre')) as OrdreMatch;
  const statut = texte(f, 'statut') as StatutMatchDavis;
  const g = texte(f, 'gagnant');
  const gagnant: Cote | null = g === '1' ? 1 : g === '2' ? 2 : null;

  if (!ORDRES_MATCH.includes(ordre) || !STATUTS_MATCH_DAVIS.includes(statut)) retour('tableau', {}, { erreur: 'Match inconnu.' });
  const donnees = await lireDonneesDavis(sb);
  const r = donnees.rencontres.find((x) => x.id === rencontreId);
  if (!r) retour('tableau', {}, { erreur: 'Rencontre introuvable.' });
  if (!r.nation1 || !r.nation2) retour('tableau', {}, { erreur: 'Les deux nations de la rencontre ne sont pas encore connues.' });

  const setsVainqueur = parserScore(texte(f, 'score'));
  if (setsVainqueur === null) retour('tableau', {}, { erreur: 'Score illisible : écris par exemple 6-4 3-6 7-6(5).' });
  const erreurs = validerResultatMatch(statut, gagnant, setsVainqueur);
  if (erreurs.length) retour('tableau', {}, { erreur: erreurs.join(' ') });

  const tranche = statut === 'termine' || statut === 'forfait' || statut === 'abandon';
  if (ordre === 3 && tranche && !doublePossible(r)) {
    retour('tableau', {}, { erreur: 'Le double ne se joue que si les nations sont à 1-1 après les deux simples.' });
  }

  const sets = gagnant === null ? setsVainqueur : orienterSets(setsVainqueur, gagnant);
  await majMatch(sb, rencontreId, ordre, {
    joueur1: texte(f, 'joueur1') || null,
    joueur2: texte(f, 'joueur2') || null,
    statut,
    gagnant: tranche ? gagnant : null,
    sets,
  });
  await synchroniserTableau(sb);
  retour('tableau', {}, { ok: 'Match enregistré.' });
}

/* ------------------------------------------------------------------ */
/*  Picks par pays                                                     */
/* ------------------------------------------------------------------ */

export async function poserPick(f: FormData): Promise<void> {
  const sb = await admin();
  const participant = await lireParticipant(sb, texte(f, 'participant'));
  if (!participant) retour('picks', {}, { erreur: 'Participant inconnu.' });
  const extra = { p: paramParticipant(participant.id) };
  const slot = texte(f, 'slot') as SlotPick;
  const nation = texte(f, 'nation');
  if (!SLOTS_PICK.includes(slot)) retour('picks', extra, { erreur: 'Emplacement inconnu.' });

  const donnees = await lireDonneesDavis(sb);
  if (participant.id === null && tourCommence(donnees.rencontres, tourDuSlot(slot), new Date())) {
    retour('picks', extra, { erreur: 'Ce tour est fermé : sa première rencontre a commencé.' });
  }
  if (nation === '') {
    await retirerPick(sb, ANNEE_DAVIS, participant.id, slot);
    retour('picks', extra, { ok: 'Pick retiré.' });
  }
  const autres = donnees.picks.filter((p) => p.participantId === participant.id);
  const erreurs = validerPick(donnees.rencontres, { slot, nation }, autres);
  if (erreurs.length) retour('picks', extra, { erreur: erreurs.join(' ') });
  await remplacerPick(sb, ANNEE_DAVIS, participant.id, slot, nation, participant.id === null ? 'app' : 'manuel');
  retour('picks', extra, { ok: 'Pick enregistré.' });
}

/* ------------------------------------------------------------------ */
/*  Bracket des nations                                                */
/* ------------------------------------------------------------------ */

export async function poserBracket(f: FormData): Promise<void> {
  const sb = await admin();
  const participant = await lireParticipant(sb, texte(f, 'participant'));
  if (!participant) retour('bracket', {}, { erreur: 'Participant inconnu.' });
  const extra = { p: paramParticipant(participant.id) };
  const donnees = await lireDonneesDavis(sb);
  if (participant.id === null && bracketFerme(donnees.rencontres, new Date())) {
    retour('bracket', extra, { erreur: 'Le bracket est fermé : le premier quart a commencé.' });
  }

  const lignes: PronoBracket[] = [];
  for (const r of donnees.rencontres) {
    const nation = texte(f, `nation-${r.tour}-${r.position}`);
    const score = texte(f, `score-${r.tour}-${r.position}`) as ScoreSets;
    if (!nation && !score) continue;
    if (!nation || !SCORES_SETS.includes(score)) {
      retour('bracket', extra, { erreur: `Choisis une nation ET un score pour ${r.tour} ${r.position}.` });
    }
    lignes.push({ tour: r.tour, position: r.position, nation, score });
  }
  const erreurs = validerBracket(donnees.rencontres, lignes);
  if (erreurs.length) retour('bracket', extra, { erreur: erreurs.join(' ') });
  await remplacerBracket(sb, ANNEE_DAVIS, participant.id, lignes, participant.id === null ? 'app' : 'manuel');
  retour('bracket', extra, { ok: 'Bracket enregistré.' });
}

/* ------------------------------------------------------------------ */
/*  Pronos des matchs                                                  */
/* ------------------------------------------------------------------ */

export async function poserPronos(f: FormData): Promise<void> {
  const sb = await admin();
  const participant = await lireParticipant(sb, texte(f, 'participant'));
  if (!participant) retour('pronos', {}, { erreur: 'Participant inconnu.' });
  const extra = { p: paramParticipant(participant.id) };
  const donnees = await lireDonneesDavis(sb);
  const r = donnees.rencontres.find((x) => x.id === texte(f, 'rencontre'));
  if (!r) retour('pronos', extra, { erreur: 'Rencontre introuvable.' });
  if (!r.nation1 || !r.nation2) retour('pronos', extra, { erreur: 'Les deux nations ne sont pas encore connues.' });
  if (participant.id === null && pronosFermes(r, new Date())) {
    retour('pronos', extra, { erreur: 'Les pronos de cette rencontre sont fermés : elle a commencé.' });
  }

  const lignes: { ordre: OrdreMatch; nation: string; sets: ScoreSets }[] = [];
  for (const ordre of ORDRES_MATCH) {
    const nation = texte(f, `nation-${ordre}`);
    const sets = texte(f, `sets-${ordre}`) as ScoreSets;
    if (!nation && !sets) continue;
    if (!nation || !SCORES_SETS.includes(sets)) retour('pronos', extra, { erreur: `Match ${ordre} : choisis une nation ET un score en sets.` });
    if (!memeNation(nation, r.nation1) && !memeNation(nation, r.nation2)) {
      retour('pronos', extra, { erreur: `Match ${ordre} : ${nation} ne joue pas cette rencontre.` });
    }
    lignes.push({ ordre, nation, sets });
  }
  await remplacerPronos(sb, r.id, participant.id, lignes, participant.id === null ? 'app' : 'manuel');
  retour('pronos', extra, { ok: 'Pronos enregistrés.' });
}
