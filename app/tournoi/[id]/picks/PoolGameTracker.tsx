'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PoolLocalGT } from '@/lib/gameTrackerPicks';

/**
 * Le pool Game Tracker lu par le panneau « Game Tracker », partagé avec la
 * grille de picks (deux composants frères de la page) pour y signaler les
 * joueurs « hors pool ». Rien n'est chargé tout seul : le pool n'existe
 * qu'après un clic sur « Lire Game Tracker ». Sans fournisseur (vue d'un
 * autre participant), les hooks renvoient « pas de pool » et ne font rien.
 */

interface Valeur {
  pool: PoolLocalGT | null;
  definir: (p: PoolLocalGT | null) => void;
}

const Contexte = createContext<Valeur | null>(null);

export function FournisseurPoolGT({ children }: { children: ReactNode }) {
  const [pool, definir] = useState<PoolLocalGT | null>(null);
  const valeur = useMemo(() => ({ pool, definir }), [pool]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

/** Pool Game Tracker connu (après « Lire »), ou null. */
export function usePoolGT(): PoolLocalGT | null {
  return useContext(Contexte)?.pool ?? null;
}

/** Pour le panneau : publier (ou effacer) le pool lu. */
export function useDefinirPoolGT(): (p: PoolLocalGT | null) => void {
  return useContext(Contexte)?.definir ?? (() => {});
}
