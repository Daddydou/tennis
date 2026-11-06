'use client';

import { useState, useTransition } from 'react';
import { boutonSecondaire } from '@/app/ui';
import { demisFinales, validerPronostic, type PronosticMasters } from '@/lib/masters';
import { enregistrerPronosticMasters } from './mastersPronosticActions';

/**
 * Saisie d'un pronostic de Masters : classer chaque poule du 1er au 4e, choisir le vainqueur des deux demies
 * que ce classement dessine, puis la championne. Même contrôle que le serveur (lib/masters.ts : validerPronostic).
 */

/** Remet d'équerre les vainqueurs de demie et la championne quand le classement change. */
function corriger(p: PronosticMasters): PronosticMasters {
  const [d1, d2] = demisFinales([p.classementA[0], p.classementA[1]], [p.classementB[0], p.classementB[1]]);
  const w1 = d1.includes(p.vainqueursDemis[0]) ? p.vainqueursDemis[0] : d1[0];
  const w2 = d2.includes(p.vainqueursDemis[1]) ? p.vainqueursDemis[1] : d2[0];
  return { ...p, vainqueursDemis: [w1, w2], champion: [w1, w2].includes(p.champion) ? p.champion : w1 };
}

export default function EditeurPronostic({
  tournamentId,
  participantId,
  poules,
  noms,
  initial,
}: {
  tournamentId: string;
  participantId: string | null;
  poules: { A: string[]; B: string[] };
  noms: Record<string, string>;
  initial: PronosticMasters;
}) {
  const [p, setP] = useState<PronosticMasters>(() => corriger(initial));
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const nom = (id: string) => noms[id] ?? id;
  const erreurs = validerPronostic(p, poules);
  const [d1, d2] = demisFinales([p.classementA[0], p.classementA[1]], [p.classementB[0], p.classementB[1]]);

  const change = (maj: Partial<PronosticMasters>) => {
    setMessage(null);
    setP((cur) => corriger({ ...cur, ...maj }));
  };
  const classement = (cle: 'classementA' | 'classementB', groupe: string[], titre: string) => (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium text-zinc-600">{titre}</legend>
      {[0, 1, 2, 3].map((i) => (
        <label key={i} className="flex items-center gap-2 text-sm">
          <span className="w-4 text-zinc-500">{i + 1}.</span>
          <select
            value={p[cle][i]}
            onChange={(e) => change({ [cle]: p[cle].map((x, k) => (k === i ? e.target.value : x)) })}
            className="min-h-11 flex-1 rounded-xl bg-white px-3 text-sm shadow-sm"
            aria-label={`${titre}, place ${i + 1}`}
          >
            {groupe.map((id) => (
              <option key={id} value={id}>
                {nom(id)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </fieldset>
  );

  const enregistrer = () =>
    demarrer(async () => {
      const r = await enregistrerPronosticMasters(tournamentId, participantId, p);
      setMessage(r.ok ? { texte: 'Pronostic enregistré.', erreur: false } : { texte: r.erreurs.join(' '), erreur: true });
    });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {classement('classementA', poules.A, 'Poule A')}
        {classement('classementB', poules.B, 'Poule B')}
      </div>
      <div className="space-y-1 text-sm">
        <label className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-xs text-zinc-600">Demie 1 ({nom(d1[0])} – {nom(d1[1])})</span>
          <select value={p.vainqueursDemis[0]} onChange={(e) => change({ vainqueursDemis: [e.target.value, p.vainqueursDemis[1]] })} className="min-h-11 rounded-xl bg-white px-3 text-sm shadow-sm" aria-label="Vainqueur de la demie 1">
            {d1.map((id) => (
              <option key={id} value={id}>
                {nom(id)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-xs text-zinc-600">Demie 2 ({nom(d2[0])} – {nom(d2[1])})</span>
          <select value={p.vainqueursDemis[1]} onChange={(e) => change({ vainqueursDemis: [p.vainqueursDemis[0], e.target.value] })} className="min-h-11 rounded-xl bg-white px-3 text-sm shadow-sm" aria-label="Vainqueur de la demie 2">
            {d2.map((id) => (
              <option key={id} value={id}>
                {nom(id)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-xs text-zinc-600">Championne</span>
          <select value={p.champion} onChange={(e) => change({ champion: e.target.value })} className="min-h-11 rounded-xl bg-white px-3 text-sm shadow-sm" aria-label="Championne">
            {p.vainqueursDemis.map((id) => (
              <option key={id} value={id}>
                {nom(id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {erreurs.length > 0 && <p className="text-xs text-red-700">{erreurs.join(' ')}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={enregistrer} disabled={enCours || erreurs.length > 0} className={boutonSecondaire}>
          {enCours ? 'Enregistrement…' : 'Enregistrer ce pronostic'}
        </button>
        {message && (
          <p role="status" className={message.erreur ? 'text-sm text-red-700' : 'text-sm text-zinc-800'}>
            {message.texte}
          </p>
        )}
      </div>
    </div>
  );
}
