'use client';

import { useState, useTransition } from 'react';
import { importerBracketParticipant, type ImportBracketResult } from './importActions';
import { nomStock, type Participant } from './types';
import { boutonPrimaire, champTexte, Spinner, zoneTactile } from '@/app/ui';

/**
 * Import d'un bracket de participant depuis l'extracteur externe (bookmarklet
 * Game Tracker) : colle le JSON produit pour UN participant, rattache ses
 * noms et ses tours (lib/bracketImport.ts), et écrit ses pronostics dans
 * tn_bracket_round_picks — les mêmes que le bloc 3 (Bracket des
 * participants), qu'il pré-remplit ainsi ; toujours corrigeable à la main
 * ensuite. Import progressif : coller un JSON plus avancé (nouveaux tours
 * révélés) complète sans jamais effacer un tour déjà importé ou saisi.
 */
export default function ImportBracketPanel({
  tournamentId,
  participants,
  onImporte,
}: {
  tournamentId: string;
  participants: Participant[];
  onImporte: (stockId: string, picks: { round: string; position: number; playerId: string }[]) => void;
}) {
  const [json, setJson] = useState('');
  const [resultat, setResultat] = useState<ImportBracketResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!json.trim()) return;
    startTransition(async () => {
      const r = await importerBracketParticipant(tournamentId, json);
      setResultat(r);
      if (r.ok && r.stockId && r.picks) onImporte(r.stockId, r.picks);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Colle le JSON produit par le bookmarklet du jeu (un participant à la fois) : ses vainqueurs pronostiqués sur
        les tours déjà révélés remplissent le bloc « Bracket des participants » —{' '}
        {participants.length > 0 && (
          <>
            reconnu pour {['Moi', ...participants.map((p) => nomStock(p.id, participants))].join(', ')}.{' '}
          </>
        )}
        Un import plus avancé (nouveaux tours) complète sans effacer les tours déjà enregistrés.
      </p>

      <form onSubmit={onSubmit} className="space-y-2">
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{ "participant": "Laki", "tours": [...] }'
          spellCheck={false}
          className={`h-40 w-full py-3 font-mono text-xs leading-relaxed ${champTexte}`}
        />
        <div className="flex items-center gap-3">
          <button type="submit" data-testid="import-submit" disabled={pending || !json.trim()} className={boutonPrimaire}>
            {pending && <Spinner />}
            {pending ? 'Import…' : 'Importer'}
          </button>
          {json.trim() && (
            <button
              type="button"
              onClick={() => {
                setJson('');
                setResultat(null);
              }}
              className={`${zoneTactile} px-2 text-xs text-zinc-500 transition active:scale-[0.97] hover:text-zinc-900`}
            >
              Effacer
            </button>
          )}
        </div>
      </form>

      {resultat && (
        <div
          className={`space-y-1.5 rounded-xl p-3 text-sm ${
            resultat.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {resultat.ok ? (
            <p className="font-medium">
              Import réussi — {resultat.picks?.length} pronostic{(resultat.picks?.length ?? 0) > 1 ? 's' : ''} enregistré
              {(resultat.picks?.length ?? 0) > 1 ? 's' : ''}.
            </p>
          ) : (
            <div className="space-y-0.5">
              <p className="font-medium">Échec de l&apos;import</p>
              <p>{resultat.error}</p>
            </div>
          )}

          {resultat.toursIgnores.length > 0 && (
            <div>
              <p className="font-medium text-amber-700">Tours ignorés :</p>
              <ul className="ml-4 list-disc text-amber-700">
                {resultat.toursIgnores.map((t, i) => (
                  <li key={i}>
                    {t.tour} — {t.raison}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resultat.nonApparies.length > 0 && (
            <div>
              <p className="font-medium text-amber-700">Noms non rattachés à un joueur du tableau :</p>
              <ul className="ml-4 list-disc text-amber-700">
                {resultat.nonApparies.map((n, i) => (
                  <li key={i}>
                    « {n.nom} » ({n.contexte}) — {n.raison === 'ambigu' ? `ambigu entre ${n.candidats?.join(', ')}` : 'introuvable'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resultat.incoherences.length > 0 && (
            <div>
              <p className="font-medium text-amber-700">Pronostic incohérent avec les 2 joueurs listés :</p>
              <ul className="ml-4 list-disc text-amber-700">
                {resultat.incoherences.map((n, i) => (
                  <li key={i}>
                    {n.contexte} — « {n.pronostique} » n&apos;est ni {n.joueurs[0]} ni {n.joueurs[1]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
