/**
 * Format JSON BRUT produit par les snippets d'extraction ATP/WTA (console du
 * navigateur) et par leurs portages `extractAtp` / `extractWta`.
 *
 * C'est exactement ce que colle l'import manuel de /import, et ce que lit
 * `parseExtract` (lib/parserExtraction.ts) : ne PAS en changer la forme.
 */

export interface SetBrut {
  games: number | null;
  tiebreak: number | null;
}

export interface JoueurBrut {
  id: string | null;
  name: string;
  seed: string | null;
  country: string | null;
  isBye: boolean;
  winner: boolean;
  sets: SetBrut[];
}

export interface MatchBrut {
  match_id: string | null;
  round: string;
  round_label: string;
  position: number;
  half: 'top' | 'bottom' | null;
  status: string;
  players: [JoueurBrut, JoueurBrut];
}

export interface ExtraitBrut {
  extracted_at: string;
  source_url: string;
  tournament: { slug: string | null; atp_id: string | null; year: number };
  tour: 'ATP' | 'WTA';
  rounds_found: string[];
  match_count: number;
  matches: MatchBrut[];
}
