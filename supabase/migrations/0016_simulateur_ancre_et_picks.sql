-- =====================================================================
-- SIMULATEUR — MODÈLE À ANCRE UNIQUE
--
-- Remplace tn_bracket_predictions (migration 0015) : le pronostic complet
-- tour par tour depuis le premier tour est abandonné au profit d'un modèle
-- plus simple, une ANCRE UNIQUE par stock (un seul joueur, choisi au tour
-- de départ), qui engrange 2^(tour−1) points à chaque tour où elle
-- l'emporte — calculé à la volée par lib/bracketSim.ts
-- (`predictionsDepuisAncre`), jamais stocké.
--
-- ⚠ PERTE DE DONNÉES ASSUMÉE : les quelques lignes de tn_bracket_predictions
-- existantes (pronostics de test/réels de Moi, Laki, Thomas sur l'US Open)
-- ne se transposent pas proprement en une ancre unique — un stock avait
-- parfois DEUX entrées à un même tour (une par moitié de tableau), et le
-- nouveau modèle n'en retient qu'une. Migrer arbitrairement l'une des deux
-- effacerait silencieusement l'autre sans que ce soit le bon choix ; on
-- repart donc d'une table vide plutôt que de deviner. Chacun re-choisit son
-- ancre en un clic depuis l'onglet Simulateur.
-- =====================================================================

drop table if exists tn_bracket_predictions;

create table if not exists tn_bracket_anchors (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tn_tournaments(id) on delete cascade,
  participant_id uuid references tn_participants(id) on delete cascade,
  player_id      text not null references tn_players(id),
  created_at     timestamptz default now()
);

create index if not exists idx_tn_bracket_anchors_tournament
  on tn_bracket_anchors(tournament_id);

create unique index if not exists idx_tn_bracket_anchors_moi
  on tn_bracket_anchors (tournament_id) where participant_id is null;
create unique index if not exists idx_tn_bracket_anchors_participant
  on tn_bracket_anchors (tournament_id, participant_id) where participant_id is not null;

-- ---------------------------------------------------------------------
-- RLS — même régime que les autres tables tn_* : lecture publique,
-- écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table tn_bracket_anchors enable row level security;

drop policy if exists tn_bracket_anchors_read on tn_bracket_anchors;
create policy tn_bracket_anchors_read on tn_bracket_anchors
  for select to anon, authenticated using (true);

revoke all on table tn_bracket_anchors from anon, authenticated;
grant select on table tn_bracket_anchors to anon, authenticated;
