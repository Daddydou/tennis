/** Types partagés entre les panneaux du simulateur — le stock 'moi' est une
 * chaîne comme les autres ici, seule sa traduction en `participant_id` (null)
 * se fait à la frontière des Server Actions. */

export interface Joueur {
  nom: string;
  rang: number | null;
}

export interface Participant {
  id: string;
  nom: string;
}

export const MOI = 'moi' as const;

export function nomStock(id: string, participants: Participant[]): string {
  return id === MOI ? 'Moi' : (participants.find((p) => p.id === id)?.nom ?? id);
}
