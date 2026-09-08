-- =====================================================================
-- PARTICIPANTS DU GROUPE — PICKS DE LAKI, THOMAS... EN PLUS DES MIENS
--
-- Chaque participant a son propre stock de joueurs, indépendant du mien et
-- des autres : un joueur pické par Laki reste disponible pour Thomas et
-- pour moi. La liste des participants est configurable (table, pas de nom
-- codé en dur) — on en ajoute ou on en retire depuis /participants.
--
-- MES picks (participant_id NULL) ne changent ni de forme ni de calcul :
-- même colonnes, même barème (tn_score_match), même unicité qu'avant. Les
-- deux contraintes d'origine (`unique(tournament_id, player_id)` et
-- `unique(tournament_id, round, half)`) sont reprises À L'IDENTIQUE, sous
-- forme d'index partiels `where participant_id is null` — un `unique(...)`
-- de table ne suffirait pas : SQL traite deux NULL comme distincts, donc
-- ajouter `participant_id` tel quel à la contrainte existante aurait permis
-- plusieurs de MES lignes sur le même joueur.
--
-- `tn_recompute_picks` / `tn_score_match` n'ont besoin d'AUCUN changement :
-- ils scorent une ligne de `tn_picks` contre son match, sans jamais
-- regarder qui est le propriétaire du pick.
-- =====================================================================

create table if not exists tn_participants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz default now()
);

alter table tn_picks
  add column if not exists participant_id uuid references tn_participants(id) on delete cascade;

-- Les deux contraintes d'origine ne portaient que sur MES picks (il n'y
-- avait rien d'autre) : on les supprime pour les remplacer par les quatre
-- index partiels ci-dessous, qui distinguent mon stock de celui des
-- participants.
alter table tn_picks drop constraint if exists tn_picks_tournament_id_player_id_key;
alter table tn_picks drop constraint if exists tn_picks_tournament_id_round_half_key;

create unique index if not exists idx_tn_picks_moi_joueur
  on tn_picks (tournament_id, player_id) where participant_id is null;
create unique index if not exists idx_tn_picks_moi_slot
  on tn_picks (tournament_id, round, half) where participant_id is null;
create unique index if not exists idx_tn_picks_participant_joueur
  on tn_picks (tournament_id, participant_id, player_id) where participant_id is not null;
create unique index if not exists idx_tn_picks_participant_slot
  on tn_picks (tournament_id, participant_id, round, half) where participant_id is not null;

create index if not exists idx_tn_picks_participant on tn_picks(participant_id);

-- Mon stock uniquement (cf. schema.sql) : les participants ont le leur, pas
-- besoin de les griser dans cette vue déjà inutilisée par l'appli.
create or replace view tn_used_players as
select
  p.tournament_id,
  p.player_id,
  pl.name,
  p.round as used_in_round,
  p.points
from tn_picks p
join tn_players pl on pl.id = p.player_id
where p.participant_id is null;

-- ---------------------------------------------------------------------
-- RLS — même régime que les autres tables tn_* : lecture publique,
-- écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table tn_participants enable row level security;

drop policy if exists tn_participants_read on tn_participants;
create policy tn_participants_read on tn_participants
  for select to anon, authenticated using (true);

revoke all on table tn_participants from anon, authenticated;
grant select on table tn_participants to anon, authenticated;
