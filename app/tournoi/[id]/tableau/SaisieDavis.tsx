'use client';

import { useState, useTransition } from 'react';
import { boutonPrimaire, carte, champTexte, noteInfo } from '@/app/ui';
import { LIBELLE_MATCH, LIBELLE_STATUT_MATCH, type OrdreMatch, type StatutMatchDavis } from '@/lib/davis';
import type { SaisieMatch } from '@/lib/davisRencontre';
import { enregistrerRencontreDavis } from './davisActions';

export interface RencontreASaisir {
  round: string;
  position: number;
  libelle: string;
  nation1: string | null;
  nation2: string | null;
  /** Matchs déjà enregistrés (score du point de vue du vainqueur). */
  saisie: SaisieMatch[];
}

interface Ligne {
  statut: StatutMatchDavis;
  gagnant: '' | '1' | '2';
  score: string;
}

const VIDE: Ligne = { statut: 'a_venir', gagnant: '', score: '' };
const STATUTS_SAISISSABLES: StatutMatchDavis[] = ['a_venir', 'termine', 'forfait', 'abandon', 'non_joue'];
const ORDRES: OrdreMatch[] = [1, 2, 3];

function lignesDepuis(saisie: SaisieMatch[]): Ligne[] {
  return ORDRES.map((ordre) => {
    const s = saisie.find((x) => x.ordre === ordre);
    return s ? { statut: s.statut, gagnant: s.gagnant === null ? '' : (String(s.gagnant) as '1' | '2'), score: s.score } : { ...VIDE };
  });
}

function CarteRencontre({ tournamentId, r }: { tournamentId: string; r: RencontreASaisir }) {
  const [lignes, setLignes] = useState<Ligne[]>(() => lignesDepuis(r.saisie));
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const pretes = !!r.nation1 && !!r.nation2;

  const maj = (i: number, patch: Partial<Ligne>) => {
    setLignes((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setMessage(null);
  };

  const enregistrer = () => {
    const saisie: SaisieMatch[] = lignes.map((l, i) => {
      const joue = l.statut === 'termine' || l.statut === 'forfait' || l.statut === 'abandon';
      return {
        ordre: ORDRES[i],
        statut: l.statut,
        gagnant: joue && l.gagnant !== '' ? (Number(l.gagnant) as 1 | 2) : null,
        score: joue && l.statut !== 'forfait' ? l.score : '',
      };
    });
    demarrer(async () => {
      const res = await enregistrerRencontreDavis(tournamentId, r.round, r.position, saisie);
      setMessage({ ok: res.ok, texte: res.ok ? res.message : res.erreur });
    });
  };

  return (
    <div className={`${carte} space-y-3 p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{r.libelle}</h3>
        <p className="text-sm text-zinc-700">{pretes ? `${r.nation1} – ${r.nation2}` : 'Nations pas encore connues'}</p>
      </div>

      {pretes && (
        <>
          <div className="space-y-2">
            {ORDRES.map((ordre, i) => {
              const l = lignes[i];
              const joue = l.statut === 'termine' || l.statut === 'forfait' || l.statut === 'abandon';
              return (
                <div key={ordre} className="grid gap-2 sm:grid-cols-[6rem_9rem_11rem_1fr] sm:items-center">
                  <span className="text-sm font-medium">{LIBELLE_MATCH[ordre]}</span>
                  <select aria-label={`${LIBELLE_MATCH[ordre]} : statut`} className={champTexte} value={l.statut} onChange={(e) => maj(i, { statut: e.target.value as StatutMatchDavis, ...(e.target.value === 'a_venir' || e.target.value === 'non_joue' ? { gagnant: '', score: '' } : {}) })}>
                    {STATUTS_SAISISSABLES.map((s) => (
                      <option key={s} value={s}>
                        {LIBELLE_STATUT_MATCH[s]}
                      </option>
                    ))}
                  </select>
                  <select aria-label={`${LIBELLE_MATCH[ordre]} : vainqueur`} className={champTexte} disabled={!joue} value={l.gagnant} onChange={(e) => maj(i, { gagnant: e.target.value as Ligne['gagnant'] })}>
                    <option value="">Vainqueur…</option>
                    <option value="1">{r.nation1}</option>
                    <option value="2">{r.nation2}</option>
                  </select>
                  <input aria-label={`${LIBELLE_MATCH[ordre]} : score du vainqueur`} className={champTexte} disabled={!joue || l.statut === 'forfait'} placeholder="6-4 3-6 7-6(5)" value={l.score} onChange={(e) => maj(i, { score: e.target.value })} />
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={boutonPrimaire} disabled={enCours} onClick={enregistrer}>
              {enCours ? 'Enregistrement…' : 'Enregistrer la rencontre'}
            </button>
            {message && <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.texte}</p>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Saisie des résultats de la Coupe Davis : une carte par rencontre, trois lignes (simple 1, simple 2, double).
 * Le score s'écrit du point de vue du VAINQUEUR du match. Le double ne se joue que si les nations sont à 1-1.
 */
export function SaisieDavis({ tournamentId, rencontres }: { tournamentId: string; rencontres: RencontreASaisir[] }) {
  return (
    <details className="space-y-3" open={rencontres.some((r) => r.saisie.length > 0)}>
      <summary className="cursor-pointer text-sm font-semibold">Saisir les résultats des rencontres</summary>
      <div className="mt-3 space-y-3">
        <p className={noteInfo}>
          Écris le score de chaque match du point de vue du vainqueur (par exemple 6-4 3-6 7-6(5)). Le double ne se joue que si les nations sont à 1-1.
          Forfait : aucun jeu compté ; abandon : seuls les sets entièrement joués comptent. Les points des picks sont recalculés à l’enregistrement.
        </p>
        {rencontres.map((r) => (
          <CarteRencontre key={`${r.round}-${r.position}`} tournamentId={tournamentId} r={r} />
        ))}
      </div>
    </details>
  );
}
