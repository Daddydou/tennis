'use server';

import { sessionValide } from '@/auth/garde';
import { importerExtraitCoeur, type ImportResult } from '@/db/importCoeur';
import { noterImportManuel } from '@/db/importAuto';

export type { ImportResult } from '@/db/importCoeur';

export async function importerExtrait(jsonText: string): Promise<ImportResult> {
  // Une Server Action est un POST vers la route qui l'héberge, pas une route
  // distincte : la couverture du proxy ne suffit pas à la protéger.
  if (!(await sessionValide())) {
    return { ok: false, error: 'Non authentifié.', avertissements: [] };
  }

  const debut = Date.now();
  const resultat = await importerExtraitCoeur(jsonText);

  // Inscription à la surveillance automatique (premier import réussi) et
  // journal. Jamais bloquant : un échec ici devient un avertissement, l'import
  // lui-même est déjà écrit.
  const suivi = await noterImportManuel(jsonText, resultat, Date.now() - debut);
  if (suivi) resultat.avertissements.push(suivi);

  return resultat;
}
