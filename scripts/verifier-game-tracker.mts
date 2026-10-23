/**
 * VÉRIFICATION EN DIRECT de l'API picks de Game Tracker — LECTURE SEULE (GET).
 *
 *   npm run verify:game-tracker                     liste les tournois jouables
 *   npm run verify:game-tracker -- --tournoi=<id>   + l'état du jeu pour ce tournoi
 *
 * Passe par le même client et les mêmes lecteurs que l'app
 * (externe/gameTrackerPicksClient.ts, lib/gameTrackerPicks.ts) : une réponse
 * dont la forme a changé fait échouer ici, avec le chemin fautif, avant de
 * faire échouer l'écran. N'envoie JAMAIS de POST. La clé
 * (GAMETRACKER_PICKS_KEY, lue dans .env.local) n'est jamais affichée.
 */
import { etatPicksGT, listerTournoisPicks } from '@/externe/gameTrackerPicksClient';

const idArg = process.argv.find((a) => a.startsWith('--tournoi='))?.slice('--tournoi='.length);

function pick(p: { prenom: string | null; nom: string | null; position: number } | null): string {
  return p ? `${[p.prenom, p.nom].filter(Boolean).join(' ') || '?'} (position ${p.position})` : '—';
}

try {
  const tournois = await listerTournoisPicks();
  console.log(`Tournois jouables : ${tournois.length}`);
  for (const t of tournois) {
    const to = t.tourOuvert ? `${t.tourOuvert.nom} (n°${t.tourOuvert.numero}), verrou ${t.tourOuvert.lockAt ?? 'inconnu'}` : 'aucun tour ouvert';
    console.log(`- ${t.id} · ${t.nom} · ${t.tour} ${t.annee} · tableau ${t.drawSize} · ${t.statut} · ${to}`);
  }

  if (idArg) {
    const e = await etatPicksGT(idArg);
    console.log(`\nÉtat pour « ${e.tournoi.nom} » (tableau ${e.tournoi.drawSize}, ${e.tournoi.statut}), relevé ${e.maintenant}`);
    const to = e.tourOuvert;
    if (!to) {
      console.log('Aucun tour ouvert aux picks.');
    } else {
      console.log(`Tour ouvert : ${to.nom} (n°${to.numero}), ${to.picksAttendus} pick(s) attendu(s), verrou ${to.lockAt ?? 'inconnu'}`);
      console.log(`Pool : ${to.pool.haut.length} en haut, ${to.pool.bas.length} en bas`);
      const tous = [...to.pool.haut, ...to.pool.bas];
      console.log(`  dont en attente : ${tous.filter((j) => j.enAttente).length} · déjà pickés : ${tous.filter((j) => j.dejaPicke).length}`);
      console.log(`Mon pick : haut ${pick(to.monPick.haut)} · bas ${pick(to.monPick.bas)} · ${to.monPick.etat}`);
    }
    console.log(`Déjà pickés aux autres tours : ${e.dejaPickes.map((p) => pick(p)).join(', ') || 'aucun'}`);
    console.log('Classement : ' + (e.classement.map((c) => `${c.pseudo}${c.moi ? ' (moi)' : ''} ${c.points}`).join(' · ') || '—'));
  }
  console.log('\nOK : réponses lues sans erreur de forme.');
} catch (err) {
  // Messages déjà sûrs (jamais de clé) : ErreurApiGT, ErreurFormatGT.
  console.error(`ÉCHEC : ${(err as Error).message}`);
  process.exit(1);
}
