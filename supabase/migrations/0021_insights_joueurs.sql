-- =====================================================================
-- INSIGHTS JOUEURS — forfait, blessure, charge, contexte sourcé
--
-- La table a été créée HORS migration (écrite par un outil externe) :
-- ce fichier la rattache à l'historique et la met au régime commun.
-- Constat en base au 2026-09-27 : RLS activée, policy de lecture
-- présente, MAIS anon/authenticated gardaient TOUS les privilèges
-- (insert, update, delete, truncate…) — seule l'absence de policy
-- d'écriture bloquait. Le revoke ci-dessous referme ça.
--
-- AFFICHAGE SEUL : rien dans le moteur (projections, picks, fantasy) ne
-- lit cette table. Lue par db/insights.ts (écran Picks uniquement).
--
-- Idempotent : rejouable sans risque, ne touche pas aux lignes.
-- =====================================================================

create table if not exists tn_player_insights (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references tn_tournaments(id) on delete cascade,
  player_id        text not null references tn_players(id) on delete cascade,
  injury_risk      boolean not null default false,
  withdrawn        boolean not null default false,
  heavy_load       boolean not null default false,
  surface_switch   boolean not null default false,
  home_tournament  boolean not null default false,
  summary          text,
  facts            jsonb not null default '[]'::jsonb,
  confidence       text not null default 'medium'
                   check (confidence in ('high', 'medium', 'low')),
  as_of            date not null default current_date,
  created_at       timestamptz not null default now(),
  unique (tournament_id, player_id, as_of)
);

create index if not exists tn_player_insights_lookup
  on tn_player_insights(tournament_id, player_id, as_of desc);

-- ---------------------------------------------------------------------
-- RLS — même régime que les autres tables tn_* (cf. 0001) :
-- lecture publique, écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table tn_player_insights enable row level security;

-- Policy d'origine (créée hors migration), remplacée par la convention.
drop policy if exists "lecture publique" on tn_player_insights;
drop policy if exists tn_player_insights_read on tn_player_insights;
create policy tn_player_insights_read on tn_player_insights
  for select to anon, authenticated using (true);

revoke all on table tn_player_insights from anon, authenticated;
grant select on table tn_player_insights to anon, authenticated;
