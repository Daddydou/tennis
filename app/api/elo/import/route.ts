import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { importerElosColles } from '@/supabase/elo-refresh';

/**
 * POST /api/elo/import
 * Body : le JSON produit par le snippet `public/extract-elo.js`, tel quel —
 * un extrait `{ tour, updated, players }` ou un tableau des deux circuits.
 *
 * MÉTHODE PRINCIPALE de mise à jour de `ta_elo`. Tennis Abstract répond 403
 * aux requêtes venant des IP de datacenter (Vercel) : `/api/elo/refresh`,
 * conservé en repli, n'aboutit plus en production. Ici, c'est le navigateur
 * qui lit la page et l'app qui reçoit le résultat par collage. L'écriture en
 * base est rigoureusement la même (cf. supabase/elo-refresh.ts).
 *
 * Écriture : session obligatoire, même garde que /api/elo/refresh. Le proxy
 * filtre déjà /api/*, mais c'est cette vérification qui fait foi.
 */
export async function POST(req: Request) {
  if (!(await sessionValide())) {
    return Response.json({ ok: false, error: 'Non authentifié.' }, { status: 401 });
  }

  // Corps lu en texte, pas en JSON : le parsing appartient à
  // `parserCollageElo`, qui distingue « JSON invalide » d'« extrait
  // incompréhensible » — deux erreurs qui n'appellent pas la même correction.
  const brut = await req.text();
  if (!brut.trim()) {
    return Response.json({ ok: false, error: 'Collage vide.' }, { status: 400 });
  }

  const r = await importerElosColles(brut);
  if (!r.ok) {
    return Response.json({ ok: false, error: r.error }, { status: 400 });
  }

  // Les Elo changent les projections affichées : on invalide les pages qui les
  // lisent. Le cache tn_projections, lui, est recalculé au prochain affichage
  // d'un tour dont la simulation manque.
  revalidatePath('/', 'layout');

  return Response.json({ ok: true, tours: r.tours });
}
