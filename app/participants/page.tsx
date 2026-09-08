import ParticipantsForm from './ParticipantsForm';
import { getParticipants, compterPicksParParticipant } from '@/supabase/queries';

export const dynamic = 'force-dynamic';

export default async function ParticipantsPage() {
  const [participants, picksParParticipant] = await Promise.all([
    getParticipants(),
    compterPicksParParticipant(),
  ]);

  const affiches = participants.map((p) => ({
    id: p.id,
    name: p.name,
    picks: picksParParticipant[p.id] ?? 0,
  }));

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Participants</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Le groupe avec qui tu compares tes picks. Chacun a son propre stock de
          joueurs par tournoi, indépendant des autres — un joueur pické par l&apos;un
          reste disponible pour tous les autres. « Moi » n&apos;apparaît pas ici :
          c&apos;est le jeu de base, toujours présent.
        </p>
      </div>
      <ParticipantsForm participants={affiches} />
    </div>
  );
}
