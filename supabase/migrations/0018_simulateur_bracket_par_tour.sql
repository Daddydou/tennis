-- =====================================================================
-- SIMULATEUR — BRACKET RECONSTRUIT, UN TOUR À LA FOIS
--
-- Remplace tn_bracket_anchors (migration 0016) : l'ancre unique par stock
-- est abandonnée au profit d'un pronostic PAR MATCH, mais restreint à UN
-- SEUL TOUR choisi à la fois (contrairement à tn_bracket_predictions,
-- migration 0015, qui couvrait tous les tours simultanément dans un même
-- écran). Chaque tour reste indépendant : changer de tour affiché
-- n'efface ni n'accumule les pronostics d'un autre tour, déjà enregistrés
-- ou non — juste le vainqueur pronostiqué à chaque emplacement du tour,
-- comme tn_bracket_predictions à l'origine. Barème (2^(tour−1)) et score
-- calculés à la volée par lib/bracketSim.ts (`scoreDuStock`), jamais
-- stockés. Même convention de stock que tn_picks (participant_id null =
-- moi).
--
-- ⚠ PERTE DE DONNÉES ASSUMÉE : les ancres de tn_bracket_anchors (un seul
-- joueur par stock, sans notion de match/position) ne se transposent pas
-- en pronostics par match — on repart d'une table vide, comme pour le
-- passage de tn_bracket_predictions à tn_bracket_anchors (0016). Chacun
-- re-choisit ses pronostics en un clic depuis l'onglet Simulateur.
-- =====================================================================

drop table if exists tn_bracket_anchors;

create table if not exists tn_bracket_round_picks (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tn_tournaments(id) on delete cascade,
  participant_id uuid references tn_participants(id) on delete cascade,
  round          text not null,
  -- Position du match dans son tour, 0-based — même convention que tn_matches.position.
  position       integer not null,
  player_id      text not null references tn_players(id),
  created_at     timestamptz default now()
);

create index if not exists idx_tn_bracket_round_picks_tournament
  on tn_bracket_round_picks(tournament_id);

create unique index if not exists idx_tn_bracket_round_picks_moi_slot
  on tn_bracket_round_picks (tournament_id, round, position) where participant_id is null;
create unique index if not exists idx_tn_bracket_round_picks_participant_slot
  on tn_bracket_round_picks (tournament_id, participant_id, round, position) where participant_id is not null;

-- ---------------------------------------------------------------------
-- RLS — même régime que les autres tables tn_* : lecture publique,
-- écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table tn_bracket_round_picks enable row level security;

drop policy if exists tn_bracket_round_picks_read on tn_bracket_round_picks;
create policy tn_bracket_round_picks_read on tn_bracket_round_picks
  for select to anon, authenticated using (true);

revoke all on table tn_bracket_round_picks from anon, authenticated;
grant select on table tn_bracket_round_picks to anon, authenticated;
