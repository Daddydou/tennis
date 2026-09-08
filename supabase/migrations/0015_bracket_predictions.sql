-- =====================================================================
-- SIMULATEUR DE POINTS DE BRACKET
--
-- Jeu distinct des picks et du Fantasy : chaque stock (moi ou un
-- participant, cf. tn_participants/migration 0014) prédit le VAINQUEUR DE
-- CHAQUE MATCH du tableau, à partir d'un tour de départ choisi (les quarts,
-- par exemple), jusqu'à la finale. Une bonne prédiction rapporte
-- 2^(numéro du tour − 1) points, compté depuis le premier tour du
-- tournoi — le barème vit dans lib/bracketSim.ts, calculé à la volée : rien
-- à stocker ici que L'IDENTITÉ du joueur prédit à chaque emplacement.
--
-- Le score et le maximum encore atteignable ne sont PAS des colonnes : ils
-- dépendent des résultats réels du moment (qui bougent à chaque import) et,
-- pour le score « scénario », d'un jeu de clics éphémère jamais persisté.
-- Les recalculer à la lecture est immédiat (lib/bracketSim.ts est pur, sans
-- Monte Carlo) — inutile de les mettre en cache.
--
-- Même convention que tn_picks pour le stock : `participant_id` NULL = moi
-- (jamais une ligne de tn_participants), une valeur non nulle = un
-- participant. Même piège NULL que là-bas (deux NULL ne sont jamais égaux
-- pour SQL) : deux index partiels plutôt qu'une contrainte de table.
-- =====================================================================

create table if not exists tn_bracket_predictions (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tn_tournaments(id) on delete cascade,
  participant_id uuid references tn_participants(id) on delete cascade,
  round          text not null,
  -- Position du match dans son tour, 0-based, dans l'ordre du tableau —
  -- même convention que tn_matches.position.
  position       integer not null,
  player_id      text not null references tn_players(id),
  created_at     timestamptz default now()
);

create index if not exists idx_tn_bracket_predictions_tournament
  on tn_bracket_predictions(tournament_id);
create index if not exists idx_tn_bracket_predictions_participant
  on tn_bracket_predictions(participant_id);

create unique index if not exists idx_tn_bracket_predictions_moi_slot
  on tn_bracket_predictions (tournament_id, round, position) where participant_id is null;
create unique index if not exists idx_tn_bracket_predictions_participant_slot
  on tn_bracket_predictions (tournament_id, participant_id, round, position) where participant_id is not null;

-- ---------------------------------------------------------------------
-- RLS — même régime que les autres tables tn_* : lecture publique,
-- écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table tn_bracket_predictions enable row level security;

drop policy if exists tn_bracket_predictions_read on tn_bracket_predictions;
create policy tn_bracket_predictions_read on tn_bracket_predictions
  for select to anon, authenticated using (true);

revoke all on table tn_bracket_predictions from anon, authenticated;
grant select on table tn_bracket_predictions to anon, authenticated;
