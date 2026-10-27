'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supprimerPick, validerPick } from '../picks/actions';
import { enregistrerReservations, type Reservation } from '../picks/reservationsActions';
import TableauJoueurs, { type EtatSlot, type InfoSlot, type LigneTableau } from './TableauJoueurs';
import PanneauRivaux from './PanneauRivaux';
import { boutonDanger, boutonPrimaire, boutonSecondaire, carte, Spinner } from '@/app/ui';
import type { PlayerInsight } from '@/lib/insights';
import type { DonneesPlan } from '@/lib/planDonnees';
import {
  cleSlot,
  construireMonde,
  planDe,
  rechercheRivaux,
  slotsAJouer,
  slotsLibresDe,
  statsDuPlan,
  totauxDesRivaux,
  utilisesDe,
  type ModeAgressivite,
} from '@/lib/planEcran';
import type { Slot } from '@/lib/types';

type Mode = ModeAgressivite | 'rivaux';

const MODES: { id: ModeAgressivite; titre: string; phrase: string }[] = [
  {
    id: 'prudent',
    titre: 'Prudent',
    phrase: 'Des points réguliers : moins de gros paris, un mauvais cas moins mauvais.',
  },
  {
    id: 'equilibre',
    titre: 'Équilibré',
    phrase: 'Le plus de points attendus sur tout le tournoi. Le meilleur choix par défaut.',
  },
  {
    id: 'audacieux',
    titre: 'Audacieux',
    phrase: 'Mise sur les joueurs à forte variance : plus de chances de gros score, au prix d’un mauvais cas plus bas.',
  },
];

const f1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)} %`;
const NOM_SLOT = (s: Slot) => (s.half === 'top' ? 'Haut' : s.half === 'bottom' ? 'Bas' : 'Unique');

interface LignePlan {
  cle: string;
  slot: Slot;
  etat: EtatSlot;
  joueur: number | null;
  e: number;
  sigma: number | null;
  planB: { joueur: number; e: number; perte: number } | null;
  points: number | null;
}

export default function PlanPicks({
  donnees: d,
  stockId,
  insights,
  reservationsInitiales,
}: {
  donnees: DonneesPlan;
  /** null = moi ; sinon un participant dont on pose les picks. */
  stockId: string | null;
  insights: Record<string, PlayerInsight | null>;
  /** Réservations enregistrées en base pour ce stock : cleSlot -> indice du joueur. */
  reservationsInitiales: Record<string, number>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('equilibre');
  const [choix, setChoixLocal] = useState<Record<string, number>>(reservationsInitiales);
  const [mondePret, setMondePret] = useState<ReturnType<typeof construireMonde> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [valideRecemment, setValideRecemment] = useState(false);
  // Retrait d'un pick validé : en deux temps, jamais sur un seul appui.
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const monde = useMemo(() => construireMonde(d), [d]);
  const stock = useMemo(() => d.participants.find((p) => p.id === stockId) ?? d.participants[0], [d, stockId]);
  const rivaux = useMemo(() => (stockId === null ? d.participants.filter((p) => p.id !== null) : []), [d, stockId]);
  const termine = d.r0 >= d.rounds.length;
  const aJouer = useMemo(() => slotsAJouer(d), [d]);
  const libres = useMemo(() => slotsLibresDe(d, stock), [d, stock]);
  const premierTourLibre = libres[0]?.round ?? null;
  // On ne peut valider que le tour dont les joueurs sont connus.
  const validable = premierTourLibre !== null && d.rounds.indexOf(premierTourLibre) === d.r0;

  /* ---- Réservations : l'app fait foi, pas le navigateur ----
     Lues en base au rendu (tn_plan_reservations), réécrites en base après
     chaque geste de l'utilisateur — jamais à l'ouverture de la page. Les
     envois sont mis en file : le dernier geste arrive toujours en dernier. */
  const [modifications, setModifications] = useState(0);
  const [sauvegarde, setSauvegarde] = useState<'ok' | 'envoi' | 'erreur'>('ok');
  const file = useRef<Promise<unknown>>(Promise.resolve());
  function setChoix(maj: (prev: Record<string, number>) => Record<string, number>) {
    setChoixLocal(maj);
    setModifications((n) => n + 1);
  }
  useEffect(() => {
    if (modifications === 0) return;
    const h = setTimeout(() => {
      const lignes: Reservation[] = Object.entries(choix).map(([cle, j]) => {
        const [round, half] = cle.split('|');
        return { round, half: half === 'top' || half === 'bottom' ? half : null, playerId: d.joueurs[j].id };
      });
      setSauvegarde('envoi');
      file.current = file.current.then(async () => {
        const r = await enregistrerReservations(d.tournoiId, stockId, lignes).catch(() => ({ ok: false }));
        setSauvegarde(r.ok ? 'ok' : 'erreur');
      });
    }, 400);
    return () => clearTimeout(h);
  }, [modifications, choix, d.joueurs, d.tournoiId, stockId]);

  /* ---- Tirages : calculés juste après l'affichage, pour ne pas bloquer la page ---- */
  useEffect(() => {
    if (termine) return;
    const h = setTimeout(() => {
      monde.contexte();
      setMondePret(monde);
    }, 20);
    return () => clearTimeout(h);
  }, [monde, termine]);
  const pret = mondePret === monde;

  /* ---- Les choix encore valables (slot libre, joueur disponible et en lice) ---- */
  const choixEff = useMemo(() => {
    const out: Record<string, number> = {};
    const utilises = utilisesDe(stock);
    const libresCles = new Set(libres.map(cleSlot));
    const vus = new Set<number>();
    for (const [cle, j] of Object.entries(choix)) {
      const [round, half] = cle.split('|');
      const joueur = d.joueurs[j];
      if (!joueur || !libresCles.has(cle) || utilises.has(j) || vus.has(j)) continue;
      if (half && joueur.moitie !== half) continue;
      if (!((monde.moments.presence[joueur.id]?.[round] ?? 0) > 0)) continue;
      out[cle] = j;
      vus.add(j);
    }
    return out;
  }, [choix, stock, libres, d.joueurs, monde]);

  /* ---- Les plans, instantanés ---- */
  const plans = useMemo(
    () => ({
      prudent: planDe(monde, stock, 'prudent', choixEff),
      equilibre: planDe(monde, stock, 'equilibre', choixEff),
      audacieux: planDe(monde, stock, 'audacieux', choixEff),
    }),
    [monde, stock, choixEff],
  );

  const rivauxTot = useMemo(() => (pret ? totauxDesRivaux(monde, rivaux) : []), [pret, monde, rivaux]);
  const stats = useMemo(
    () =>
      pret
        ? {
            prudent: statsDuPlan(monde, stock, plans.prudent, rivauxTot),
            equilibre: statsDuPlan(monde, stock, plans.equilibre, rivauxTot),
            audacieux: statsDuPlan(monde, stock, plans.audacieux, rivauxTot),
          }
        : null,
    [pret, monde, stock, plans, rivauxTot],
  );
  const recherche = useMemo(
    () => (pret && mode === 'rivaux' && rivaux.length > 0 ? rechercheRivaux(monde, stock, rivaux, choixEff) : null),
    [pret, mode, monde, stock, rivaux, choixEff],
  );

  /* ---- Le plan affiché, slot par slot ---- */
  const lignesPlan = useMemo<LignePlan[]>(() => {
    const { esp, ecart } = monde.moments;
    const eDe = (j: number, round: string) => esp[d.joueurs[j].id]?.[round] ?? 0;
    const sDe = (j: number, round: string) => ecart[d.joueurs[j].id]?.[round] ?? 0;
    const poses = new Map(stock.picks.map((k) => [cleSlot(k), k]));

    // Picks du plan affiché : celui du niveau choisi, ou la recommandation contre les rivaux.
    const duPlan = new Map<string, { joueur: number; planB: LignePlan['planB'] }>();
    if (mode === 'rivaux') {
      if (recherche) {
        libres.forEach((s, i) => {
          const j = recherche.recommandee.cibles[i];
          if (j !== null && j !== undefined) duPlan.set(cleSlot(s), { joueur: j, planB: null });
        });
      }
    } else {
      for (const p of plans[mode].picks) {
        duPlan.set(cleSlot(p), {
          joueur: d.joueurs.findIndex((x) => x.id === p.playerId),
          planB: p.planB
            ? { joueur: d.joueurs.findIndex((x) => x.id === p.planB!.playerId), e: p.planB.ePoints, perte: p.planB.perte }
            : null,
        });
      }
    }

    return aJouer.map((slot): LignePlan => {
      const cle = cleSlot(slot);
      const pose = poses.get(cle);
      if (pose) {
        return { cle, slot, etat: 'valide', joueur: pose.joueur, e: eDe(pose.joueur, slot.round), sigma: sDe(pose.joueur, slot.round), planB: null, points: pose.points };
      }
      const c = choixEff[cle];
      if (c !== undefined) {
        return { cle, slot, etat: 'choisi', joueur: c, e: eDe(c, slot.round), sigma: sDe(c, slot.round), planB: null, points: null };
      }
      const p = duPlan.get(cle);
      if (p && p.joueur >= 0) {
        return { cle, slot, etat: 'plan', joueur: p.joueur, e: eDe(p.joueur, slot.round), sigma: sDe(p.joueur, slot.round), planB: p.planB, points: null };
      }
      return { cle, slot, etat: 'vide', joueur: null, e: 0, sigma: null, planB: null, points: null };
    });
  }, [monde, d.joueurs, stock, mode, recherche, libres, plans, aJouer, choixEff]);

  /* ---- Le grand tableau ---- */
  const infoSlots = useMemo(() => {
    const m = new Map<string, InfoSlot>();
    for (const l of lignesPlan) m.set(l.cle, { joueur: l.joueur, etat: l.etat });
    return m;
  }, [lignesPlan]);

  const cleDeCellule = useMemo(() => {
    return (idx: number, round: string): string | null => {
      const j = d.joueurs[idx];
      const s = aJouer.find((x) => x.round === round && (x.half === null || x.half === j.moitie));
      return s ? cleSlot(s) : null;
    };
  }, [d.joueurs, aJouer]);

  const roundsAffiches = useMemo(() => d.rounds.slice(d.r0), [d.rounds, d.r0]);
  const tourCourant = d.rounds[d.r0] ?? d.rounds[d.rounds.length - 1];

  const lignesTableau = useMemo<LigneTableau[]>(() => {
    if (termine) return [];
    const partenaire = new Map<number, number>();
    for (let i = 0; i + 1 < d.ouverture.length; i += 2) {
      const a = d.ouverture[i];
      const b = d.ouverture[i + 1];
      if (a !== null && b !== null) {
        partenaire.set(a, b);
        partenaire.set(b, a);
      }
    }
    const utilises = utilisesDe(stock);
    const { esp, ecart, presence } = monde.moments;
    const out: LigneTableau[] = [];
    d.joueurs.forEach((j, idx) => {
      if (!presence[j.id]) return;
      const adv = partenaire.get(idx);
      const fixe = adv !== undefined ? monde.t.fixe(idx, adv) : undefined;
      const parTour: LigneTableau['parTour'] = {};
      for (const r of roundsAffiches) {
        const pres = presence[j.id]?.[r];
        if (pres === undefined) continue;
        parTour[r] = { e: esp[j.id]?.[r] ?? 0, presence: pres, sigma: ecart[j.id]?.[r] ?? 0 };
      }
      out.push({
        idx,
        id: j.id,
        nom: j.nom,
        rang: j.rang,
        elo: j.elo,
        sourceElo: j.sourceElo,
        taName: j.taName,
        candidatsElo: j.candidatsElo,
        moitie: j.moitie,
        adversaire: adv !== undefined ? { nom: d.joueurs[adv].nom, rang: d.joueurs[adv].rang, elo: d.joueurs[adv].elo } : null,
        pVictoire: adv !== undefined ? monde.t.p(idx, adv) : null,
        pointsMatch: adv !== undefined ? monde.t.ep(idx, adv) : null,
        resultat: fixe ? (fixe.gagnantEstA ? 'gagne' : 'perdu') : null,
        parTour,
        utilise: utilises.has(idx),
        prisPar: d.participants
          .filter((p) => p !== stock)
          .flatMap((p) => p.picks.filter((k) => k.joueur === idx).map((k) => ({ nom: p.nom, round: k.round }))),
        insight: insights[j.id] ?? null,
      });
    });
    return out;
  }, [termine, d, monde, stock, roundsAffiches, insights]);

  /* ---- Actions ---- */
  function onCellule(idx: number, round: string) {
    const cle = cleDeCellule(idx, round);
    if (!cle) return;
    setValideRecemment(false);
    setChoix((prev) => {
      const suivant = { ...prev };
      if (suivant[cle] === idx) delete suivant[cle];
      else {
        for (const k of Object.keys(suivant)) if (suivant[k] === idx) delete suivant[k];
        suivant[cle] = idx;
      }
      return suivant;
    });
  }

  function choisir(l: LignePlan, joueur: number | null = l.joueur) {
    if (joueur === null) return;
    setChoix((prev) => {
      const suivant = { ...prev };
      for (const k of Object.keys(suivant)) if (suivant[k] === joueur) delete suivant[k];
      suivant[l.cle] = joueur;
      return suivant;
    });
  }

  function annuler(l: LignePlan) {
    setChoix((prev) => {
      const suivant = { ...prev };
      delete suivant[l.cle];
      return suivant;
    });
  }

  function valider(lignes: LignePlan[]) {
    setErreur(null);
    setEnCours(lignes.map((l) => l.cle).join(','));
    startTransition(async () => {
      for (const l of lignes) {
        if (l.joueur === null) continue;
        const r = await validerPick(d.tournoiId, l.slot.round, l.slot.half, d.joueurs[l.joueur].id, l.e, stockId);
        if (!r.ok) {
          setErreur(r.error ?? `Le pick de ${d.joueurs[l.joueur].nom} n’a pas pu être validé. Réessaie ; s’il est refusé, le tour est peut-être verrouillé.`);
          setEnCours(null);
          return;
        }
        setChoix((prev) => {
          const suivant = { ...prev };
          delete suivant[l.cle];
          return suivant;
        });
      }
      setEnCours(null);
      setValideRecemment(stockId === null);
      router.refresh();
    });
  }

  function retirer(l: LignePlan) {
    setErreur(null);
    setAConfirmer(null);
    setEnCours(l.cle);
    startTransition(async () => {
      const r = await supprimerPick(d.tournoiId, l.slot.round, l.slot.half, stockId);
      setEnCours(null);
      if (!r.ok) setErreur(r.error ?? 'Le pick n’a pas pu être retiré. Réessaie dans un instant.');
      else router.refresh();
    });
  }

  function appliquerCibles(cibles: (number | null)[]) {
    setChoix((prev) => {
      const suivant = { ...prev };
      const tour = libres.find((s) => !(cleSlot(s) in choixEff))?.round;
      libres.forEach((s, i) => {
        const j = cibles[i];
        if (s.round !== tour || j === null || j === undefined) return;
        for (const k of Object.keys(suivant)) if (suivant[k] === j) delete suivant[k];
        suivant[cleSlot(s)] = j;
      });
      return suivant;
    });
  }

  if (termine) {
    return <p className="text-sm text-zinc-500">Tournoi terminé : il n’y a plus de pick à poser.</p>;
  }
  if (libres.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        {stock.nom === 'Moi' ? 'Tous tes picks sont posés pour ce tournoi.' : `Tous les picks de ${stock.nom} sont posés.`}
      </p>
    );
  }

  const nomRivaux = rivaux.map((r) => r.nom).join(' et ');
  const lignesAValider = lignesPlan.filter(
    (l) => validable && l.slot.round === premierTourLibre && (l.etat === 'plan' || l.etat === 'choisi') && l.joueur !== null,
  );
  const dejaVides = lignesPlan.filter((l) => l.etat === 'vide' && l.slot.round === premierTourLibre).length;
  const modeCourant = mode === 'rivaux' ? null : MODES.find((m) => m.id === mode)!;
  const nbChoix = Object.keys(choixEff).length;

  return (
    <div className="space-y-5">
      {/* ── Les 4 modes, avec ce que chacun donne ── */}
      <section className="space-y-2" aria-label="Façon de jouer">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((m) => {
            const s = stats?.[m.id];
            const actif = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={actif}
                className={`rounded-2xl p-3 text-left transition active:scale-[0.99] ${carte} ${
                  actif ? 'ring-2 ring-zinc-900' : 'hover:bg-zinc-50'
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{m.titre}</span>
                  <span className="font-mono text-lg font-semibold tabular-nums text-zinc-900">
                    {s ? f1(s.moyenne) : f1(plans[m.id].total)}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-zinc-600">
                  {s ? (
                    <>
                      entre {Math.round(s.p10)} et {Math.round(s.p90)} pts dans 80 % des cas
                      {s.pPremier !== null && ` · ${pct(s.pPremier)} de finir 1er`}
                    </>
                  ) : (
                    'calcul des scénarios…'
                  )}
                </span>
              </button>
            );
          })}
          {stockId === null && rivaux.length > 0 && (
            <button
              type="button"
              onClick={() => setMode('rivaux')}
              aria-pressed={mode === 'rivaux'}
              className={`rounded-2xl p-3 text-left transition active:scale-[0.99] ${carte} ${
                mode === 'rivaux' ? 'ring-2 ring-zinc-900' : 'hover:bg-zinc-50'
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">Contre {nomRivaux}</span>
                <span className="font-mono text-lg font-semibold tabular-nums">
                  {stats ? pct(stats.equilibre.pPremier ?? 0) : '…'}
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-zinc-600">
                chance de finir devant eux (plan équilibré) — cherche mieux d’après leurs picks
              </span>
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          {modeCourant
            ? modeCourant.phrase
            : `Cherche les picks du prochain tour qui maximisent ta chance de finir devant ${nomRivaux}, d’après leurs picks déjà posés.`}{' '}
          Le gros chiffre est le total de points attendu pour le tournoi (picks déjà joués compris).
        </p>
      </section>

      {/* ── Contre Laki et Thomas ── */}
      {mode === 'rivaux' && stockId === null && (
        <PanneauRivaux
          d={d}
          moi={stock}
          rivaux={rivaux}
          recherche={recherche}
          pret={pret}
          cibles={appliquerCibles}
          choixActifs={nbChoix}
          statsEquilibre={stats?.equilibre ?? null}
        />
      )}

      {/* ── Le plan, tour par tour ── */}
      <section className="space-y-2" aria-label="Plan par tour">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {stockId === null ? 'Mon plan' : `Plan de ${stock.nom}`}
            <span className="ml-2 text-xs font-normal text-zinc-500">
              {nbChoix > 0
                ? `${nbChoix} réservation${nbChoix > 1 ? 's' : ''}, le reste s’adapte`
                : 'recalculé à chaque choix et à chaque résultat'}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {/* Où en est l'enregistrement des réservations (partagées entre appareils). */}
            <span role="status" className={`text-xs ${sauvegarde === 'erreur' ? 'text-red-700' : 'text-zinc-500'}`}>
              {sauvegarde === 'envoi'
                ? 'Enregistrement…'
                : sauvegarde === 'erreur'
                  ? 'Réservations non enregistrées : refais ton dernier choix'
                  : modifications > 0
                    ? 'Réservations enregistrées'
                    : ''}
            </span>
            {nbChoix > 0 && (
              <button type="button" onClick={() => setChoix(() => ({}))} className={boutonSecondaire}>
                Effacer mes réservations
              </button>
            )}
          </div>
        </div>

        <div className={`${carte} divide-y divide-zinc-100 overflow-hidden`}>
          {lignesPlan.map((l, i) => {
            const nouveauTour = i === 0 || lignesPlan[i - 1].slot.round !== l.slot.round;
            const joueur = l.joueur !== null ? d.joueurs[l.joueur] : null;
            const occupe = enCours !== null && enCours.split(',').includes(l.cle);
            const peutValider = validable && l.slot.round === premierTourLibre && (l.etat === 'plan' || l.etat === 'choisi');
            return (
              <div key={l.cle}>
                {nouveauTour && (
                  <div className="flex items-center justify-between bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <span>
                      {l.slot.round}
                      {l.slot.round === premierTourLibre && validable ? ' · à poser maintenant' : ''}
                    </span>
                    {l.slot.round === premierTourLibre && !validable && (
                      <span className="font-normal normal-case tracking-normal">
                        validation à la fin du {tourCourant} · tu peux réserver
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="w-14 shrink-0 text-xs text-zinc-500">{NOM_SLOT(l.slot)}</span>
                  <div className="min-w-0 flex-1">
                    {joueur ? (
                      <>
                        <span className="font-semibold">{joueur.nom}</span>
                        {joueur.rang ? <span className="ml-1 text-xs text-zinc-500">#{joueur.rang}</span> : null}
                        <span
                          className={`ml-2 rounded px-1.5 py-px text-xs font-medium ${
                            l.etat === 'valide'
                              ? 'bg-emerald-100 text-emerald-800'
                              : l.etat === 'choisi'
                                ? 'bg-zinc-900 text-white'
                                : 'bg-zinc-100 text-zinc-700'
                          }`}
                        >
                          {l.etat === 'valide' ? 'validé' : l.etat === 'choisi' ? 'ton choix' : 'plan'}
                        </span>
                        {l.etat === 'plan' && l.planB && (
                          <span className="mt-0.5 block text-xs text-zinc-500">
                            plan B : {d.joueurs[l.planB.joueur].nom} ({f1(l.planB.e)} pts, −{f1(l.planB.perte)} sur le plan)
                            <button
                              type="button"
                              onClick={() => choisir(l, l.planB!.joueur)}
                              className="ml-1.5 font-medium text-blue-600 underline underline-offset-2"
                            >
                              le prendre
                            </button>
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-zinc-500">aucun joueur utile</span>
                    )}
                  </div>
                  {joueur && (
                    <span className="shrink-0 text-right" title="Points espérés, ± écart-type">
                      <span className="block font-mono text-sm font-semibold tabular-nums">
                        {l.etat === 'valide' && l.points !== null ? f1(l.points) : f1(l.e)}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {l.etat === 'valide' && l.points !== null ? 'pts réels' : l.sigma !== null ? `± ${f1(l.sigma)}` : 'pts espérés'}
                      </span>
                    </span>
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    {peutValider && (
                      <button
                        type="button"
                        onClick={() => valider([l])}
                        disabled={pending}
                        className={l.etat === 'choisi' ? boutonPrimaire : boutonSecondaire}
                      >
                        {occupe && <Spinner />}
                        Valider
                      </button>
                    )}
                    {!peutValider && l.etat === 'plan' && (
                      <button type="button" onClick={() => choisir(l)} className={boutonSecondaire} title="Réserve ce joueur : le reste du plan s’adapte">
                        Réserver
                      </button>
                    )}
                    {l.etat === 'choisi' && (
                      <button type="button" onClick={() => annuler(l)} className={boutonDanger}>
                        Annuler
                      </button>
                    )}
                    {l.etat === 'valide' && l.slot.round === tourCourant && aConfirmer !== l.cle && (
                      <button type="button" onClick={() => setAConfirmer(l.cle)} disabled={pending} className={boutonDanger}>
                        {occupe && <Spinner />}
                        Retirer
                      </button>
                    )}
                    {l.etat === 'valide' && aConfirmer === l.cle && (
                      <>
                        <button type="button" onClick={() => retirer(l)} disabled={pending} className={boutonDanger}>
                          Oui, retirer
                        </button>
                        <button type="button" onClick={() => setAConfirmer(null)} className={boutonSecondaire}>
                          Garder
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {lignesAValider.length > 1 && (
            <button type="button" onClick={() => valider(lignesAValider)} disabled={pending} className={boutonPrimaire}>
              {pending && enCours?.includes(',') && <Spinner />}
              Valider les {lignesAValider.length} picks du tour {premierTourLibre}
            </button>
          )}
          {dejaVides > 0 && validable && (
            <span className="text-sm text-amber-700">
              {dejaVides} pick{dejaVides > 1 ? 's' : ''} du tour sans joueur disponible : tous les survivants de cette
              moitié sont déjà pris par {stock.nom === 'Moi' ? 'toi' : stock.nom}.
            </span>
          )}
          {erreur && (
            <span role="alert" className="text-sm text-red-700">
              {erreur}
            </span>
          )}
        </div>

        {valideRecemment && (
          <div className="rounded-xl bg-zinc-100 px-3 py-2 text-xs text-zinc-800">
            Pick validé chez nous. Pour qu’il compte chez Thomas, envoie-le sur Game Tracker :{' '}
            <a href="#game-tracker" className="font-medium underline underline-offset-2">
              ouvrir le panneau Game Tracker
            </a>
            .
          </div>
        )}
      </section>

      {/* ── Le grand tableau ── */}
      <TableauJoueurs
        lignes={lignesTableau}
        rounds={roundsAffiches}
        premierTourLibre={premierTourLibre}
        tourCourant={tourCourant}
        cleDeCellule={cleDeCellule}
        infoSlots={infoSlots}
        onCellule={onCellule}
        avecPoolGT={stockId === null}
      />
    </div>
  );
}
