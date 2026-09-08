-- =====================================================================
-- SIMULATEUR — BAC À SABLE DE PICKS (section Picks, distincte de Bracket)
--
-- tn_simulated_picks : picks hypothétiques sur un tableau TESTÉ, mêmes
-- règles que le jeu de picks réel (2 par tour, 1 en demies/finale) mais
-- entièrement séparé de tn_picks, qui ne doit contenir que les vrais picks
-- soumis. Aucun point stocké : le barème détaillé (lib/scoring.ts) ne peut
-- pas s'appliquer à un tour pas encore joué pour de vrai — l'écran substitue
-- l'espérance du moteur Monte Carlo existant, recalculée à la volée.
-- =====================================================================

create table if not exists tn_simulated_picks (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tn_tournaments(id) on delete cascade,
  participant_id uuid references tn_participants(id) on delete cascade,
  round          text not null,
  half           text check (half in ('top','bottom')),
  player_id      text not null references tn_players(id),
  created_at     timestamptz default now()
);

create index if not exists idx_tn_simulated_picks_tournament
  on tn_simulated_picks(tournament_id);

create unique index if not exists idx_tn_simulated_picks_moi_joueur
  on tn_simulated_picks (tournament_id, player_id) where participant_id is null;
create unique index if not exists idx_tn_simulated_picks_moi_slot
  on tn_simulated_picks (tournament_id, round, half) where participant_id is null;
create unique index if not exists idx_tn_simulated_picks_participant_joueur
  on tn_simulated_picks (tournament_id, participant_id, player_id) where participant_id is not null;
create unique index if not exists idx_tn_simulated_picks_participant_slot
  on tn_simulated_picks (tournament_id, participant_id, round, half) where participant_id is not null;

-- ---------------------------------------------------------------------
-- RLS — même régime que les autres tables tn_* : lecture publique,
-- écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table tn_simulated_picks enable row level security;

drop policy if exists tn_simulated_picks_read on tn_simulated_picks;
create policy tn_simulated_picks_read on tn_simulated_picks
  for select to anon, authenticated using (true);

revoke all on table tn_simulated_picks from anon, authenticated;
grant select on table tn_simulated_picks to anon, authenticated;
