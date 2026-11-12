-- =====================================================================
-- COUPE DAVIS (phase finale à 8 nations) — tournoi lancé par Thomas
--
-- Cinq tables, toutes indépendantes de tn_tournaments / tn_players (les « joueurs » du jeu sont des
-- nations, et la Coupe Davis n'entre ni au palmarès ni dans la Race) :
--   tn_davis_rencontres : une rencontre (quart, demie, finale) entre deux nations
--   tn_davis_matchs     : ses trois matchs (simple 1, simple 2, double), score en sets
--   tn_davis_picks      : picks par pays, un par emplacement (QF-top, QF-bottom, SF, F)
--   tn_davis_bracket    : bracket des nations (vainqueur + score de chaque rencontre)
--   tn_davis_pronos     : pronos des matchs (vainqueur + score en sets)
--
-- `participant_id` null = moi. Même régime que les autres tables tn_* : lecture publique, écritures
-- réservées à la service role (Server Actions après sessionValide()).
-- =====================================================================

create table if not exists tn_davis_rencontres (
  id          uuid primary key default gen_random_uuid(),
  annee       int  not null,
  tour        text not null check (tour in ('QF', 'SF', 'F')),
  position    int  not null check (position between 1 and 4),
  nation1     text,
  nation2     text,
  debut       timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (annee, tour, position)
);

create table if not exists tn_davis_matchs (
  id            uuid primary key default gen_random_uuid(),
  rencontre_id  uuid not null references tn_davis_rencontres(id) on delete cascade,
  ordre         int  not null check (ordre between 1 and 3),
  joueur1       text,
  joueur2       text,
  statut        text not null default 'a_venir'
                check (statut in ('a_venir', 'en_cours', 'termine', 'forfait', 'abandon', 'non_joue')),
  gagnant       int check (gagnant in (1, 2)),
  -- [{"g1": 6, "g2": 4}, ...] : jeux du côté 1 puis du côté 2, set par set.
  sets          jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now(),
  unique (rencontre_id, ordre)
);

create table if not exists tn_davis_picks (
  id              uuid primary key default gen_random_uuid(),
  annee           int  not null,
  participant_id  uuid references tn_participants(id) on delete cascade,
  slot            text not null check (slot in ('QF-top', 'QF-bottom', 'SF', 'F')),
  nation          text not null,
  source          text not null default 'app' check (source in ('app', 'thomas', 'manuel')),
  created_at      timestamptz not null default now()
);

-- Un pick par emplacement et par participant ; un pays ne se pique qu'une fois sur la compétition.
create unique index if not exists idx_tn_davis_picks_moi_slot
  on tn_davis_picks (annee, slot) where participant_id is null;
create unique index if not exists idx_tn_davis_picks_participant_slot
  on tn_davis_picks (annee, participant_id, slot) where participant_id is not null;
create unique index if not exists idx_tn_davis_picks_moi_nation
  on tn_davis_picks (annee, lower(nation)) where participant_id is null;
create unique index if not exists idx_tn_davis_picks_participant_nation
  on tn_davis_picks (annee, participant_id, lower(nation)) where participant_id is not null;

create table if not exists tn_davis_bracket (
  id              uuid primary key default gen_random_uuid(),
  annee           int  not null,
  participant_id  uuid references tn_participants(id) on delete cascade,
  tour            text not null check (tour in ('QF', 'SF', 'F')),
  position        int  not null check (position between 1 and 4),
  nation          text not null,
  score           text not null check (score in ('2-0', '2-1')),
  source          text not null default 'app' check (source in ('app', 'thomas', 'manuel')),
  created_at      timestamptz not null default now()
);

create unique index if not exists idx_tn_davis_bracket_moi
  on tn_davis_bracket (annee, tour, position) where participant_id is null;
create unique index if not exists idx_tn_davis_bracket_participant
  on tn_davis_bracket (annee, participant_id, tour, position) where participant_id is not null;

create table if not exists tn_davis_pronos (
  id              uuid primary key default gen_random_uuid(),
  rencontre_id    uuid not null references tn_davis_rencontres(id) on delete cascade,
  participant_id  uuid references tn_participants(id) on delete cascade,
  ordre           int  not null check (ordre between 1 and 3),
  nation          text not null,
  sets            text not null check (sets in ('2-0', '2-1')),
  source          text not null default 'app' check (source in ('app', 'thomas', 'manuel')),
  created_at      timestamptz not null default now()
);

create unique index if not exists idx_tn_davis_pronos_moi
  on tn_davis_pronos (rencontre_id, ordre) where participant_id is null;
create unique index if not exists idx_tn_davis_pronos_participant
  on tn_davis_pronos (rencontre_id, participant_id, ordre) where participant_id is not null;

-- RLS : lecture publique, aucune policy d'écriture (service role seulement).
alter table tn_davis_rencontres enable row level security;
alter table tn_davis_matchs     enable row level security;
alter table tn_davis_picks      enable row level security;
alter table tn_davis_bracket    enable row level security;
alter table tn_davis_pronos     enable row level security;

drop policy if exists tn_davis_rencontres_read on tn_davis_rencontres;
create policy tn_davis_rencontres_read on tn_davis_rencontres for select to anon, authenticated using (true);
drop policy if exists tn_davis_matchs_read on tn_davis_matchs;
create policy tn_davis_matchs_read on tn_davis_matchs for select to anon, authenticated using (true);
drop policy if exists tn_davis_picks_read on tn_davis_picks;
create policy tn_davis_picks_read on tn_davis_picks for select to anon, authenticated using (true);
drop policy if exists tn_davis_bracket_read on tn_davis_bracket;
create policy tn_davis_bracket_read on tn_davis_bracket for select to anon, authenticated using (true);
drop policy if exists tn_davis_pronos_read on tn_davis_pronos;
create policy tn_davis_pronos_read on tn_davis_pronos for select to anon, authenticated using (true);

revoke all on table tn_davis_rencontres from anon, authenticated;
revoke all on table tn_davis_matchs     from anon, authenticated;
revoke all on table tn_davis_picks      from anon, authenticated;
revoke all on table tn_davis_bracket    from anon, authenticated;
revoke all on table tn_davis_pronos     from anon, authenticated;
grant select on table tn_davis_rencontres to anon, authenticated;
grant select on table tn_davis_matchs     to anon, authenticated;
grant select on table tn_davis_picks      to anon, authenticated;
grant select on table tn_davis_bracket    to anon, authenticated;
grant select on table tn_davis_pronos     to anon, authenticated;
