'use client';

import { useState, useTransition } from 'react';
import { boutonSecondaire, carte, noteInfo } from '@/app/ui';
import type { PreparationEnvoiMasters, Souhait } from '@/lib/mastersGT';
import { envoyerGameTrackerMasters, lireGameTrackerMasters, preparerGameTrackerMasters, type LectureMasters } from './mastersGTActions';

/**
 * Panneau Game Tracker d'un Masters : lire (Game Tracker fait foi, ses picks sont recopiés chez nous), puis,
 * pour chaque tour encore ouvert, choisir parmi le plan conseillé et ses alternatives, VÉRIFIER, et seulement
 * alors CONFIRMER l'envoi. Rien ne part tout seul.
 */

export interface SlotConseille {
  round: string;
  half: 'top' | 'bottom' | null;
  playerId: string;
  ep: number;
  fixe: boolean;
  alternatives: { playerId: string; ep: number }[];
}

const cleSlot = (round: string, half: string | null) => `${round}|${half ?? ''}`;
const pts = (x: number) => x.toFixed(1).replace('.', ',');

export default function PanneauGTMasters({ tournamentId, picks, noms }: { tournamentId: string; picks: SlotConseille[]; noms: Record<string, string> }) {
  const [lecture, setLecture] = useState<LectureMasters | null>(null);
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [prep, setPrep] = useState<{ numero: number; souhaits: Souhait[]; r: PreparationEnvoiMasters } | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [enCours, demarrer] = useTransition();
  const nom = (id: string) => noms[id] ?? id;

  const souhaitsDuTour = (round: string): Souhait[] =>
    picks.filter((p) => p.round === round).map((p) => ({ half: p.half, playerId: choix[cleSlot(p.round, p.half)] ?? p.playerId }));

  const lire = () =>
    demarrer(async () => {
      setMessage(null);
      setPrep(null);
      const r = await lireGameTrackerMasters(tournamentId);
      setLecture(r);
      if (!r.ok) setMessage({ texte: r.erreur, erreur: true });
    });

  const verifier = (numero: number, round: string) =>
    demarrer(async () => {
      setMessage(null);
      const souhaits = souhaitsDuTour(round);
      const r = await preparerGameTrackerMasters(tournamentId, numero, souhaits);
      if (!r.ok) {
        setPrep(null);
        setMessage({ texte: r.raisons.join(' '), erreur: true });
        return;
      }
      setPrep({ numero, souhaits, r });
    });

  const envoyer = () =>
    demarrer(async () => {
      if (!prep || !prep.r.ok) return;
      const r = await envoyerGameTrackerMasters(tournamentId, prep.numero, prep.souhaits, { haut: prep.r.haut, bas: prep.r.bas });
      if (!r.ok) {
        setMessage({ texte: r.raisons.join(' '), erreur: true });
        return;
      }
      setPrep(null);
      setLecture(r.lecture);
      setMessage({ texte: r.message, erreur: false });
    });

  return (
    <section className={`${carte} space-y-3 p-4`} data-testid="panneau-gt-masters">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-base font-semibold">Game Tracker</h2>
        <span className="text-xs text-zinc-600">rien n&apos;est envoyé sans ton clic</span>
      </header>
      <p className="text-xs text-zinc-600">
        Lit ton état chez Game Tracker (ses picks sont recopiés chez nous : Game Tracker fait foi) et y pose tes picks, tour par tour, d&apos;après le plan
        conseillé ou l&apos;une de ses alternatives.
      </p>
      <button type="button" onClick={lire} disabled={enCours} className={boutonSecondaire}>
        {enCours && !prep ? 'Lecture…' : lecture?.ok ? 'Relire Game Tracker' : 'Lire Game Tracker'}
      </button>

      {message && (
        <p role="status" className={message.erreur ? 'text-sm text-red-700' : 'text-sm text-zinc-800'}>
          {message.texte}
        </p>
      )}

      {lecture?.ok && (
        <div className="space-y-3">
          {lecture.alignement.inconnus.length > 0 && <p className={noteInfo}>Participants inconnus de l&apos;app, ignorés : {lecture.alignement.inconnus.join(', ')}.</p>}
          {lecture.tours.map((t) => {
            const slots = picks.filter((p) => p.round === t.round);
            return (
              <div key={t.numero} className="space-y-2 rounded-xl bg-zinc-50 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h3 className="text-sm font-medium text-titre">{t.nom}</h3>
                  <span className="text-xs text-zinc-600">{t.lockAt ? `verrou : ${new Date(t.lockAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })}` : 'verrou : inconnu'}</span>
                </div>
                <p className="text-xs text-zinc-600">
                  Chez Game Tracker aujourd&apos;hui : {t.picksAttendus === 1 ? (t.haut ?? '— (manquant)') : `${t.haut ?? '—'} · ${t.bas ?? '—'}`}
                </p>
                {slots.map((s) => {
                  const options = [{ playerId: s.playerId, ep: s.ep, recommande: true }, ...s.alternatives.map((a) => ({ ...a, recommande: false }))];
                  const valeur = choix[cleSlot(s.round, s.half)] ?? s.playerId;
                  const libelle = s.half === 'top' ? 'Poule A' : s.half === 'bottom' ? 'Poule B' : 'Pick';
                  return (
                    <label key={cleSlot(s.round, s.half)} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-16 text-xs text-zinc-600">{libelle}</span>
                      <select
                        value={valeur}
                        disabled={s.fixe}
                        onChange={(e) => {
                          setPrep(null);
                          setChoix((c) => ({ ...c, [cleSlot(s.round, s.half)]: e.target.value }));
                        }}
                        className="min-h-11 rounded-xl bg-white px-3 text-sm shadow-sm"
                      >
                        {options.map((o) => (
                          <option key={o.playerId} value={o.playerId}>
                            {nom(o.playerId)} · {pts(o.ep)} pts{o.recommande ? ' (conseillé)' : ''}
                          </option>
                        ))}
                      </select>
                      {s.fixe && <span className="text-xs text-zinc-500">déjà posé</span>}
                    </label>
                  );
                })}
                <button type="button" onClick={() => verifier(t.numero, t.round)} disabled={enCours || slots.length === 0} className={boutonSecondaire}>
                  Vérifier l&apos;envoi
                </button>
                {prep && prep.numero === t.numero && prep.r.ok && (
                  <div className="space-y-2 rounded-xl bg-white p-3 text-sm shadow-sm">
                    <p className="font-medium">À envoyer pour {prep.r.nomTour} :</p>
                    <ul className="list-disc pl-5 text-sm">
                      {prep.r.lignes.map((l) => (
                        <li key={l.cote}>
                          {t.picksAttendus === 1 ? 'Pick' : l.cote === 'haut' ? 'Poule A' : 'Poule B'} : {l.nom ?? '—'}
                          {l.origine === 'conserve' ? ' (déjà chez Game Tracker, conservé)' : ''}
                          {l.enAttente ? ' (pas encore jouée : le pick pourra être redirigé)' : ''}
                        </li>
                      ))}
                    </ul>
                    {prep.r.dejaAJour ? (
                      <p className="text-xs text-zinc-600">Game Tracker a déjà exactement ces picks.</p>
                    ) : (
                      <button type="button" onClick={envoyer} disabled={enCours} className={boutonSecondaire}>
                        {enCours ? 'Envoi…' : 'Confirmer et envoyer chez Game Tracker'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {lecture.classement.length > 0 && (
            <div className="text-sm">
              <h3 className="text-xs font-medium text-soustitre">Classement Game Tracker</h3>
              <ol className="mt-1">
                {lecture.classement.map((c) => (
                  <li key={c.pseudo}>
                    {c.rang ?? '–'}. {c.moi ? `${c.pseudo} (moi)` : c.pseudo} — {c.points} pts
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
