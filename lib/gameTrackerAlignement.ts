/**
 * GAME TRACKER -> NOS PICKS : une fois un tour verrouillé chez Game Tracker,
 * c'est LEUR jeu qui compte (classement officiel du groupe). On aligne donc
 * nos picks (Moi, Laki, Thomas) sur les leurs, tour par tour.
 *
 * Module PUR (aucun accès réseau ni base) : il calcule un PLAN de changements,
 * que db/gameTrackerAlignement.ts applique.
 *
 * Principes, même prudence que l'envoi (lib/gameTrackerPicks.ts) :
 *   - seuls les tours de `tours` DIFFÉRENTS du tour ouvert sont alignés
 *     (verrouillés ou terminés : plus personne ne peut les changer) ;
 *   - chaque position est traduite en NOTRE joueur (premier tour du tableau)
 *     puis RECOUPÉE par le nom : un seul désaccord et RIEN n'est aligné ;
 *   - un pseudo inconnu est ignoré (avertissement), jamais deviné ;
 *   - un côté vide chez Game Tracker vide le nôtre (leur jeu fait foi) ;
 *   - un de nos picks d'un AUTRE tour (pas encore aligné) qui utilise un joueur
 *     désormais pris par Game Tracker dans ce stock est retiré : sinon la
 *     règle « un joueur une fois par tournoi ET PAR PARTICIPANT » serait violée.
 *     Un joueur peut toujours être pris par plusieurs participants.
 */
import { correspondanceTours, memeNom, type MatchInterne } from './bracketExternePont';
import { resoudreParticipant } from './bracketImport';
import type { PickGT, TourJoueGT } from './gameTrackerPicks';

/** Un de nos picks, tous stocks confondus (stockId null = moi). */
export interface PickStock {
  stockId: string | null;
  round: string;
  half: 'top' | 'bottom' | null;
  playerId: string;
}

export type ActionAlignement = 'ajout' | 'remplacement' | 'retrait' | 'retrait-conflit';

export interface ChangementAlignement {
  stockId: string | null;
  stockNom: string;
  round: string;
  half: 'top' | 'bottom' | null;
  action: ActionAlignement;
  /** Notre pick avant (null si aucun). */
  avant: { playerId: string; nom: string } | null;
  /** Le pick de Game Tracker (null pour un retrait). */
  apres: { playerId: string; nom: string } | null;
}

export type PlanAlignement =
  | {
      ok: true;
      /** Nos tours alignés (R32, R16…), dans l'ordre. */
      rounds: string[];
      changements: ChangementAlignement[];
      avertissements: string[];
    }
  | { ok: false; raisons: string[] };

export interface ParametresAlignement {
  drawSize: number;
  tourOuvert: number | null;
  tours: TourJoueGT[];
  /** tn_tournaments.rounds. */
  rounds: string[];
  /** Slots du tournoi (genererSlots) : half null = tour à un seul pick. */
  slots: { round: string; half: 'top' | 'bottom' | null }[];
  matchs: MatchInterne[];
  /** player_id -> nom interne (au moins les joueurs du premier tour). */
  noms: Map<string, string>;
  participants: { id: string; name: string }[];
  picks: PickStock[];
}

const cle = (stockId: string | null, round: string, half: string | null) => `${stockId ?? 'moi'}|${round}|${half ?? ''}`;

export function planAlignementGT(p: ParametresAlignement): PlanAlignement {
  const corr = correspondanceTours(p.drawSize, p.rounds);
  if (!corr.ok) return { ok: false, raisons: [corr.erreur] };

  const idDePosition = new Map<number, string>();
  for (const m of p.matchs.filter((x) => x.round === corr.premierRound)) {
    if (m.player1Id) idDePosition.set(2 * m.position + 1, m.player1Id);
    if (m.player2Id) idDePosition.set(2 * m.position + 2, m.player2Id);
  }
  const nom = (id: string) => p.noms.get(id) ?? id;
  const nomStock = (stockId: string | null) =>
    stockId === null ? 'Moi' : (p.participants.find((x) => x.id === stockId)?.name ?? stockId);

  const raisons: string[] = [];
  const avertissements: string[] = [];
  /** Ce que Game Tracker impose : clé stock|round|half -> playerId (null = côté vide). */
  const voulu = new Map<string, { stockId: string | null; round: string; half: 'top' | 'bottom' | null; playerId: string | null }>();
  const roundsAlignes: string[] = [];

  const traduire = (pick: PickGT | null, contexte: string): string | null => {
    if (!pick) return null;
    const id = idDePosition.get(pick.position);
    if (!id) {
      raisons.push(`${contexte} : position ${pick.position} vide au premier tour chez nous.`);
      return null;
    }
    if (pick.nom && !memeNom(pick.prenom, pick.nom, nom(id))) {
      raisons.push(
        `${contexte} : position ${pick.position} = ${[pick.prenom, pick.nom].filter(Boolean).join(' ')} chez Game Tracker, ${nom(id)} chez nous.`,
      );
      return null;
    }
    return id;
  };

  const tours = [...p.tours].filter((t) => t.numero !== p.tourOuvert).sort((a, b) => a.numero - b.numero);
  for (const t of tours) {
    const round = corr.roundDuTour(t.numero);
    if (!round) {
      avertissements.push(`Tour ${t.numero} (${t.nom}) de Game Tracker absent de notre tableau : ignoré.`);
      continue;
    }
    const halves = p.slots.filter((s) => s.round === round).map((s) => s.half);
    const unSeul = halves.length === 1 && halves[0] === null;
    roundsAlignes.push(round);
    for (const pk of t.picks) {
      let stockId: string | null;
      if (pk.moi) stockId = null;
      else {
        const r = resoudreParticipant(pk.pseudo, p.participants);
        if (!r.ok) {
          avertissements.push(`Joueur Game Tracker « ${pk.pseudo} » inconnu chez nous : ses picks sont ignorés.`);
          continue;
        }
        stockId = r.stockId;
      }
      const ctx = `${round} de ${nomStock(stockId)}`;
      if (unSeul) {
        const id = traduire(pk.haut ?? pk.bas, ctx);
        voulu.set(cle(stockId, round, null), { stockId, round, half: null, playerId: id });
      } else {
        voulu.set(cle(stockId, round, 'top'), { stockId, round, half: 'top', playerId: traduire(pk.haut, ctx) });
        voulu.set(cle(stockId, round, 'bottom'), { stockId, round, half: 'bottom', playerId: traduire(pk.bas, ctx) });
      }
    }
  }
  if (raisons.length) return { ok: false, raisons };

  const changements: ChangementAlignement[] = [];
  const actuel = new Map(p.picks.map((x) => [cle(x.stockId, x.round, x.half), x] as const));

  for (const v of voulu.values()) {
    const a = actuel.get(cle(v.stockId, v.round, v.half));
    if ((a?.playerId ?? null) === v.playerId) continue;
    changements.push({
      stockId: v.stockId,
      stockNom: nomStock(v.stockId),
      round: v.round,
      half: v.half,
      action: v.playerId === null ? 'retrait' : a ? 'remplacement' : 'ajout',
      avant: a ? { playerId: a.playerId, nom: nom(a.playerId) } : null,
      apres: v.playerId ? { playerId: v.playerId, nom: nom(v.playerId) } : null,
    });
  }

  // Nos picks des tours NON alignés qui réutiliseraient, dans le même stock, un
  // joueur désormais pris par Game Tracker : retirés (unicité par participant).
  const alignes = new Set(roundsAlignes);
  const prisParStock = new Map<string, Set<string>>();
  for (const v of voulu.values()) {
    if (!v.playerId) continue;
    const k = v.stockId ?? 'moi';
    if (!prisParStock.has(k)) prisParStock.set(k, new Set());
    prisParStock.get(k)!.add(v.playerId);
  }
  for (const x of p.picks) {
    if (alignes.has(x.round)) continue;
    if (!prisParStock.get(x.stockId ?? 'moi')?.has(x.playerId)) continue;
    changements.push({
      stockId: x.stockId,
      stockNom: nomStock(x.stockId),
      round: x.round,
      half: x.half,
      action: 'retrait-conflit',
      avant: { playerId: x.playerId, nom: nom(x.playerId) },
      apres: null,
    });
  }

  const ordre = (r: string) => p.rounds.indexOf(r);
  const cote = (h: string | null) => (h === 'top' ? 0 : h === 'bottom' ? 1 : 2);
  changements.sort((a, b) => a.stockNom.localeCompare(b.stockNom) || ordre(a.round) - ordre(b.round) || cote(a.half) - cote(b.half));
  return { ok: true, rounds: roundsAlignes, changements, avertissements };
}

/** Phrase courte pour l'écran : « Laki, R32 haut : Balshaw → Nakashima ». */
export function decrireChangement(c: ChangementAlignement): string {
  const cote = c.half === 'top' ? ' haut' : c.half === 'bottom' ? ' bas' : '';
  const lieu = `${c.stockNom}, ${c.round}${cote}`;
  switch (c.action) {
    case 'ajout':
      return `${lieu} : ${c.apres?.nom} (ajouté)`;
    case 'remplacement':
      return `${lieu} : ${c.avant?.nom} → ${c.apres?.nom}`;
    case 'retrait':
      return `${lieu} : ${c.avant?.nom} retiré (aucun pick chez Game Tracker)`;
    case 'retrait-conflit':
      return `${lieu} : ${c.avant?.nom} retiré (déjà pris par ce participant à un tour terminé chez Game Tracker)`;
  }
}
