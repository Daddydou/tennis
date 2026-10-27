'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { synchroniserThomas, type ResultatSynchroThomas } from './actions';
import { boutonPrimaire, boutonSecondaire, carte, champTexte, Spinner } from '@/app/ui';

export interface TournoiInterne {
  id: string;
  nom: string;
}

function date(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Un tournoi de Thomas : lien vers notre tournoi, aperçu, synchro, compte rendu. */
export default function CarteThomas(p: {
  id: string;
  nom: string;
  majThomas: string | null;
  derniereSynchro: string | null;
  interne: string | null;
  internes: TournoiInterne[];
}) {
  const [interne, setInterne] = useState(p.interne ?? '');
  const [ecraser, setEcraser] = useState(false);
  const [resultat, setResultat] = useState<ResultatSynchroThomas | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const choix = p.interne && !p.internes.some((t) => t.id === p.interne) ? [{ id: p.interne, nom: p.interne }, ...p.internes] : p.internes;
  const aJour = p.derniereSynchro && p.majThomas && p.derniereSynchro >= p.majThomas;

  function lancer(apercu: boolean) {
    setResultat(null);
    startTransition(async () => {
      const r = await synchroniserThomas(p.id, { apercu, ecraser, interne: interne || null });
      setResultat(r);
      if (r.ok && r.ecrit) router.refresh();
    });
  }

  return (
    <li className={`${carte} space-y-3 p-4 text-sm`}>
      <div>
        <p className="font-medium">{p.nom}</p>
        <p className="text-zinc-500">
          Modifié chez Thomas {date(p.majThomas)} · dernière synchro {date(p.derniereSynchro)}
          {aJour ? ' · à jour' : ''}
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-zinc-600">Tournoi lié (Simulateur)</span>
        <select value={interne} onChange={(e) => setInterne(e.target.value)} className={`w-full ${champTexte}`}>
          <option value="">— aucun (copie seule, sans pont) —</option>
          {choix.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nom}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-zinc-600">
        <input type="checkbox" checked={ecraser} onChange={(e) => setEcraser(e.target.checked)} className="h-5 w-5" />
        Remplacer aussi les écarts par la valeur de Thomas
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={pending} onClick={() => lancer(true)} className={`w-full sm:w-auto ${boutonSecondaire}`}>
          {pending && <Spinner />}
          Aperçu
        </button>
        <button type="button" disabled={pending} onClick={() => lancer(false)} className={`w-full sm:w-auto ${boutonPrimaire}`}>
          {pending && <Spinner />}
          Synchroniser
        </button>
      </div>

      {resultat && <CompteRendu r={resultat} />}
    </li>
  );
}

function CompteRendu({ r }: { r: ResultatSynchroThomas }) {
  if (!r.ok) {
    return (
      <div className="rounded-xl bg-red-50 p-3 text-red-900">
        <p className="font-medium">Échec : {r.erreur}</p>
        {r.details && r.details.length > 0 && (
          <ul className="ml-4 mt-1 list-disc">
            {r.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  const { resume: s, pont } = r;
  return (
    <div className={`space-y-2 rounded-xl p-3 ${r.ecrit ? 'bg-emerald-50 text-emerald-950' : 'bg-zinc-50 text-zinc-800'}`}>
      <p className="font-medium">{r.ecrit ? 'Synchronisé' : 'Aperçu — rien n’a été écrit'}</p>
      {!s.verrouille ? (
        <p>Pas encore verrouillé chez Thomas{s.lockAt ? ` (prévu ${date(s.lockAt)})` : ''} : rien ne sort avant le 1er tour.</p>
      ) : (
        <>
          <p>
            {s.tours} tour(s), {s.matchs} match(s), {s.pronostics} pronostic(s)
            {s.joueurAbsent ? ` · ${s.joueurAbsent} pick(s) sur joueur déjà éliminé` : ''}
          </p>
          <ul className="space-y-0.5">
            {s.participants.map((x) => (
              <li key={x.pseudo}>
                {x.thomas === x.calcule ? '✓' : '⚠'} {x.pseudo} : {x.thomas ?? '—'} chez Thomas → {x.calcule} recalculé
              </li>
            ))}
          </ul>
          {s.ecartsPoints.length > 0 && <p className="text-amber-800">⚠ {s.ecartsPoints.length} écart(s) de points : à examiner.</p>}
          {s.desaccordsResultat > 0 && <p className="text-amber-800">⚠ {s.desaccordsResultat} résultat(s) jugé(s) différemment.</p>}
          {s.placesNonDesignees.length > 0 && (
            <p>Lucky loser(s) non désignée(s) : position(s) {s.placesNonDesignees.join(', ')}.</p>
          )}
        </>
      )}

      <div className="border-t border-black/5 pt-2">
        <p className="font-medium">Simulateur</p>
        {pont.statut !== 'ok' ? (
          <p>{pont.message}</p>
        ) : (
          <>
            <p>
              {pont.inseres} ajouté(s), {pont.modifies} remplacé(s), {pont.identiques} déjà identique(s)
              {pont.ecrit ? '' : ' (aperçu)'} ·{' '}
              <Link href={`/tournoi/${pont.tournamentId}/simulateur`} className="underline">
                ouvrir
              </Link>
            </p>
            {pont.enAttenteNonDesignee > 0 && <p>{pont.enAttenteNonDesignee} pronostic(s) en attente d’une place nommée.</p>}
            {pont.pseudosInconnus.length > 0 && <p className="text-amber-800">⚠ Pseudo(s) inconnu(s) : {pont.pseudosInconnus.join(', ')}</p>}
            {pont.byesSuspects.length > 0 && (
              <p className="text-amber-800">⚠ {pont.byesSuspects.length} exemption(s) différente(s) chez Thomas : réimporter le tableau.</p>
            )}
            {pont.ecarts.length > 0 && (
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-amber-800">
                  {pont.ecarts.length} écart(s) {pont.ecrit && pont.modifies ? 'remplacé(s)' : 'laissé(s) tel(s) quel(s)'}
                </summary>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {pont.ecarts.map((e, i) => (
                    <li key={i}>
                      {e.stock} {e.round}|{e.position} : chez nous {e.nomInterne}, chez Thomas {e.nomThomas}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
