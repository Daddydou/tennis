-- =====================================================================
-- PRONOSTICS D'UN MASTERS (ATP Finals, WTA Finals)
--
-- Dans un Masters, le « bracket » est remplacé par un pronostic : classer chaque poule du 1er au 4e,
-- choisir le vainqueur des deux demies que ce classement dessine, puis la championne. Il ferme au premier
-- match du tournoi. Points : qualifiée trouvée 4, place exacte 2, finaliste trouvée 8, championne 16 (64 max).
--
-- Un pronostic par participant et par tournoi (participant_id null = moi). Les joueuses sont des
-- identifiants tn_players (text). Même régime que les autres tables tn_* : lecture publique, écritures
-- réservées à la service role.
-- =====================================================================

create table if not exists tn_masters_pronostics (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references tn_tournaments(id) on delete cascade,
  participant_id   uuid references tn_participants(id) on delete cascade,
  classement_a     text[] not null check (cardinality(classement_a) = 4),
  classement_b     text[] not null check (cardinality(classement_b) = 4),
  vainqueur_demi1  text not null,
  vainqueur_demi2  text not null,
  champion         text not null,
  source           text not null default 'app' check (source in ('app', 'thomas', 'manuel')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_tn_masters_pronostics_tournoi on tn_masters_pronostics (tournament_id);
create unique index if not exists idx_tn_masters_pronostics_moi
  on tn_masters_pronostics (tournament_id) where participant_id is null;
create unique index if not exists idx_tn_masters_pronostics_participant
  on tn_masters_pronostics (tournament_id, participant_id) where participant_id is not null;

alter table tn_masters_pronostics enable row level security;

drop policy if exists tn_masters_pronostics_read on tn_masters_pronostics;
create policy tn_masters_pronostics_read on tn_masters_pronostics
  for select to anon, authenticated using (true);

revoke all on table tn_masters_pronostics from anon, authenticated;
grant select on table tn_masters_pronostics to anon, authenticated;
