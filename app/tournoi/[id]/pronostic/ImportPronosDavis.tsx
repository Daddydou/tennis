'use client';

import { useState, useTransition } from 'react';
import { boutonPrimaire, carte, champTexte, noteInfo } from '@/app/ui';
import { importerPronosGT, type ResultatImportPronos } from './davisPronosActions';

/**
 * Collage du texte d'une page Game Tracker (Pronos ou Bracket). Game Tracker n'a pas d'API pour ces deux jeux :
 * on copie la page (Ctrl+A, Ctrl+C), on la colle ici, l'app reconnaît l'écran et enregistre.
 * Pour un bracket (un participant à la fois), il faut dire de qui il s'agit.
 */
export default function ImportPronosDavis({ tournamentId }: { tournamentId: string }) {
  const [texte, setTexte] = useState('');
  const [pseudo, setPseudo] = useState('Daddy');
  const [resultat, setResultat] = useState<ResultatImportPronos | null>(null);
  const [enCours, demarrer] = useTransition();

  const envoyer = () => {
    setResultat(null);
    demarrer(async () => {
      const res = await importerPronosGT(tournamentId, texte, pseudo);
      setResultat(res);
      if (res.ok) setTexte('');
    });
  };

  return (
    <section className={`${carte} space-y-3 p-4`} data-testid="import-pronos-davis">
      <h2 className="text-sm">Importer depuis Game Tracker</h2>
      <p className="text-xs text-zinc-600">
        Ouvre la page <strong>Pronos</strong> (tous les participants, une fois la rencontre commencée) ou la page <strong>Bracket</strong> (un participant à la fois) de Game Tracker, copie tout
        (Ctrl+A puis Ctrl+C) et colle ici. L&apos;app reconnaît l&apos;écran. Pour le bracket, choisis de qui il s&apos;agit. Rien n&apos;est envoyé à Game Tracker.
      </p>
      <textarea
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          setResultat(null);
        }}
        rows={6}
        placeholder="Colle ici le texte de la page Game Tracker…"
        className={`${champTexte} w-full font-mono text-xs`}
        aria-label="Texte de la page Game Tracker"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-zinc-700">
          Si c&apos;est un bracket, de qui ?
          <select value={pseudo} onChange={(e) => setPseudo(e.target.value)} className={champTexte} aria-label="Participant du bracket">
            <option value="Daddy">Moi</option>
            <option value="Laki">Laki</option>
            <option value="moustiton">Thomas (moustiton)</option>
          </select>
        </label>
        <button type="button" onClick={envoyer} disabled={enCours || texte.trim().length < 20} className={boutonPrimaire}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      {resultat && (
        <div className={noteInfo} role="status">
          <p className={resultat.ok ? 'font-medium' : 'font-medium text-red-400'}>{resultat.ok ? resultat.message : resultat.erreur}</p>
          {resultat.details.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {resultat.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
