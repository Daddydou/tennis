-- =====================================================================
-- ÉCRAN PICKS — RÉSERVATIONS DU PLAN
--
-- tn_plan_reservations : les joueurs « réservés » sur l'écran Picks pour un
-- tour à venir (bouton Réserver, case du grand tableau). Ce ne sont PAS des
-- picks : rien n'est compté ni envoyé à Game Tracker, le plan se réorganise
-- seulement autour d'eux. Avant, ils vivaient dans le navigateur
-- (localStorage) : un choix fait au téléphone n'existait pas sur l'ordinateur.
-- L'app fait désormais foi, quel que soit l'appareil.
--
-- Mêmes règles d'unicité que tn_picks / tn_simulated_picks, par stock
-- (participant_id null = moi) : un joueur réservé une seule fois, une seule
-- réservation par slot (tour + moitié).
-- =====================================================================

create table if not exists tn_plan_reservations (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tn_tournaments(id) on delete cascade,
  participant_id uuid references tn_participants(id) on delete cascade,
  round          text not null,
  half           text check (half in ('top','bottom')),
  player_id      text not null references tn_players(id),
  created_at     timestamptz default now()
);

create index if not exists idx_tn_plan_reservations_tournament
  on tn_plan_reservations(tournament_id);

create unique index if not exists idx_tn_plan_reservations_moi_joueur
  on tn_plan_reservations (tournament_id, player_id) where participant_id is null;
create unique index if not exists idx_tn_plan_reservations_moi_slot
  on tn_plan_reservations (tournament_id, round, coalesce(half, '')) where participant_id is null;
create unique index if not exists idx_tn_plan_reservations_participant_joueur
  on tn_plan_reservations (tournament_id, participant_id, player_id) where participant_id is not null;
create unique index if not exists idx_tn_plan_reservations_participant_slot
  on tn_plan_reservations (tournament_id, participant_id, round, coalesce(half, '')) where participant_id is not null;

-- ---------------------------------------------------------------------
-- RLS — même régime que les autres tables tn_* : lecture publique,
-- écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table tn_plan_reservations enable row level security;

drop policy if exists tn_plan_reservations_read on tn_plan_reservations;
create policy tn_plan_reservations_read on tn_plan_reservations
  for select to anon, authenticated using (true);

revoke all on table tn_plan_reservations from anon, authenticated;
grant select on table tn_plan_reservations to anon, authenticated;
