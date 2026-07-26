-- =====================================================================
-- TENNIS PICKS — SCHÉMA SUPABASE
-- Projet : ubnkuwyqclrjckogldlc
-- Usage mono-utilisateur (Daddy), ~40 tournois/an ATP + WTA
-- =====================================================================

-- ---------------------------------------------------------------------
-- JOUEURS
-- Clé = ID officiel ATP/WTA (ex. 'RE44'), stable dans le temps.
-- Règle les problèmes d'alias rencontrés sur CDM26.
-- ---------------------------------------------------------------------
create table if not exists tn_players (
  id              text primary key,              -- ID ATP/WTA
  tour            text not null check (tour in ('ATP','WTA')),
  name            text not null,
  full_name       text,
  country         text,
  rank            integer,
  rank_updated_at date,

  -- Elo (source : repo Jeff Sackmann)
  elo_overall     numeric,
  elo_hard        numeric,
  elo_clay        numeric,
  elo_grass       numeric,
  elo_updated_at  date,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_tn_players_tour on tn_players(tour);
create index if not exists idx_tn_players_rank on tn_players(rank);

-- ---------------------------------------------------------------------
-- TOURNOIS
-- ---------------------------------------------------------------------
create table if not exists tn_tournaments (
  id            uuid primary key default gen_random_uuid(),
  external_id   text,                             -- id ATP/WTA (ex. '1536')
  slug          text,                             -- 'madrid'
  name          text not null,
  tour          text not null check (tour in ('ATP','WTA')),
  category      text,                             -- 'GS', 'M1000', 'WTA1000'
  surface       text check (surface in ('hard','clay','grass','carpet')),
  draw_size     integer,                          -- 32, 48, 56, 96, 128
  best_of       integer default 3,                -- 5 pour les GS masculins
  year          integer not null,
  start_date    date,
  end_date      date,
  status        text default 'upcoming'
                check (status in ('upcoming','running','completed')),
  rounds        text[],                           -- ['R64','R32','R16','QF','SF','F']
  created_at    timestamptz default now(),
  unique (external_id, tour, year)
);

-- ---------------------------------------------------------------------
-- MATCHS
-- sets stocké en jsonb : [{"g1":6,"g2":4,"tb1":null,"tb2":null}, ...]
-- ---------------------------------------------------------------------
create table if not exists tn_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tn_tournaments(id) on delete cascade,
  external_id   text,                             -- 'ms017'
  round         text not null,                    -- 'R64','QF','F'...
  round_order   integer not null,                 -- 1..7, pour trier
  position      integer,                          -- position dans le tour
  half          text check (half in ('top','bottom')),

  player1_id    text references tn_players(id),
  player2_id    text references tn_players(id),
  winner_id     text references tn_players(id),

  sets          jsonb default '[]'::jsonb,
  status        text default 'scheduled'
                check (status in ('scheduled','live','completed',
                                  'walkover','retired','bye')),
  scheduled_at  timestamptz,
  updated_at    timestamptz default now(),
  unique (tournament_id, round, position)
);

create index if not exists idx_tn_matches_tournament on tn_matches(tournament_id);
create index if not exists idx_tn_matches_round on tn_matches(tournament_id, round_order);
create index if not exists idx_tn_matches_players
  on tn_matches(player1_id, player2_id);

-- ---------------------------------------------------------------------
-- MES PICKS
-- Contrainte clé : un joueur ne peut être pické qu'UNE FOIS par tournoi.
-- ---------------------------------------------------------------------
create table if not exists tn_picks (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tn_tournaments(id) on delete cascade,
  round         text not null,
  half          text check (half in ('top','bottom')),
  player_id     text not null references tn_players(id),

  points        integer,                          -- calculé après le match
  points_match  integer,
  points_sets   integer,
  points_games  integer,

  e_points      numeric,                          -- espérance au moment du pick
  locked_at     timestamptz,
  created_at    timestamptz default now(),

  -- LA contrainte structurante du jeu
  unique (tournament_id, player_id),
  unique (tournament_id, round, half)
);

create index if not exists idx_tn_picks_tournament on tn_picks(tournament_id);

-- ---------------------------------------------------------------------
-- SIMULATIONS / ESPÉRANCES
-- Recalculé avant chaque tour par le moteur.
-- ---------------------------------------------------------------------
create table if not exists tn_projections (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tn_tournaments(id) on delete cascade,
  from_round    text,                             -- tour de départ de la simulation
  player_id     text not null references tn_players(id),
  round         text not null,

  p_reach       numeric,                          -- P(atteint ce tour)
  p_win         numeric,                          -- P(gagne son match)
  e_points      numeric,                          -- espérance de points
  e_net_sets    numeric,
  e_net_games   numeric,
  opportunity   numeric,                          -- coût d'opportunité

  computed_at   timestamptz default now(),
  -- Le cache Monte Carlo dépend du tour de départ (simulerDepuis) : la clé
  -- d'unicité inclut donc from_round.
  unique (tournament_id, from_round, player_id, round)
);

create index if not exists idx_tn_proj_lookup
  on tn_projections(tournament_id, round, e_points desc);

-- =====================================================================
-- FONCTION DE SCORING
-- Règles : 5 pts victoire | net sets x3 (plancher 0)
--          net games sur SETS GAGNÉS uniquement
--          walkover : 5 + 3/set incomplet + 2/set incomplet
-- =====================================================================
create or replace function tn_score_match(
  p_sets      jsonb,      -- [{"g1":6,"g2":4}, ...] du point de vue du joueur
  p_won       boolean,
  p_status    text,
  p_best_of   integer default 3
)
returns table (
  pts_match  integer,
  pts_sets   integer,
  pts_games  integer,
  pts_total  integer
)
language plpgsql
immutable
as $$
declare
  v_sets_won    integer := 0;
  v_sets_lost   integer := 0;
  v_net_games   integer := 0;
  v_incomplete  integer := 0;
  v_needed      integer;
  v_set         jsonb;
  v_g1          integer;
  v_g2          integer;
  v_match       integer := 0;
  v_psets       integer := 0;
  v_pgames      integer := 0;
begin
  v_needed := p_best_of / 2 + 1;

  -- Cas sans points
  if p_status in ('bye','scheduled','live') then
    return query select 0, 0, 0, 0;
    return;
  end if;

  -- Parcours des sets
  for v_set in select * from jsonb_array_elements(coalesce(p_sets,'[]'::jsonb))
  loop
    v_g1 := (v_set->>'g1')::integer;
    v_g2 := (v_set->>'g2')::integer;
    if v_g1 is null or v_g2 is null then
      continue;
    end if;
    if v_g1 > v_g2 then
      v_sets_won  := v_sets_won + 1;
      v_net_games := v_net_games + (v_g1 - v_g2);   -- sets gagnés seulement
    else
      v_sets_lost := v_sets_lost + 1;
    end if;
  end loop;

  -- Points de victoire
  if p_won then
    v_match := 5;
  end if;

  -- Net sets, plancher à 0
  v_psets := greatest(0, v_sets_won - v_sets_lost) * 3;

  -- Net games, plancher à 0
  v_pgames := greatest(0, v_net_games);

  -- Walkover / abandon : créditer les sets non joués
  if p_status in ('walkover','retired') and p_won then
    v_incomplete := greatest(0, v_needed - v_sets_won);
    v_psets  := v_psets  + v_incomplete * 3;
    v_pgames := v_pgames + v_incomplete * 2;
  end if;

  return query select v_match, v_psets, v_pgames, v_match + v_psets + v_pgames;
end;
$$;

-- =====================================================================
-- RECALCUL DES POINTS D'UN TOURNOI
-- =====================================================================
create or replace function tn_recompute_picks(p_tournament_id uuid)
returns integer
language plpgsql
as $$
declare
  v_pick    record;
  v_match   record;
  v_sets    jsonb;
  v_won     boolean;
  v_score   record;
  v_count   integer := 0;
  v_best_of integer;
begin
  select best_of into v_best_of
  from tn_tournaments where id = p_tournament_id;

  for v_pick in
    select * from tn_picks where tournament_id = p_tournament_id
  loop
    select * into v_match
    from tn_matches
    where tournament_id = p_tournament_id
      and round = v_pick.round
      and (player1_id = v_pick.player_id or player2_id = v_pick.player_id)
    limit 1;

    if not found then
      update tn_picks
         set points = 0, points_match = 0, points_sets = 0, points_games = 0
       where id = v_pick.id;
      continue;
    end if;

    -- Orienter les sets du point de vue du joueur pické
    if v_match.player1_id = v_pick.player_id then
      select jsonb_agg(jsonb_build_object(
               'g1', (s->>'g1')::int, 'g2', (s->>'g2')::int))
        into v_sets
        from jsonb_array_elements(v_match.sets) s;
    else
      select jsonb_agg(jsonb_build_object(
               'g1', (s->>'g2')::int, 'g2', (s->>'g1')::int))
        into v_sets
        from jsonb_array_elements(v_match.sets) s;
    end if;

    v_won := (v_match.winner_id = v_pick.player_id);

    select * into v_score
    from tn_score_match(coalesce(v_sets,'[]'::jsonb), v_won,
                        v_match.status, coalesce(v_best_of,3));

    update tn_picks
       set points       = v_score.pts_total,
           points_match = v_score.pts_match,
           points_sets  = v_score.pts_sets,
           points_games = v_score.pts_games
     where id = v_pick.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- =====================================================================
-- VUES
-- =====================================================================
create or replace view tn_tournament_summary as
select
  t.id,
  t.name,
  t.tour,
  t.year,
  t.surface,
  t.status,
  count(p.id)                     as picks_made,
  coalesce(sum(p.points), 0)      as total_points,
  round(avg(p.points), 2)         as avg_points
from tn_tournaments t
left join tn_picks p on p.tournament_id = t.id
group by t.id
order by t.start_date desc;

-- Joueurs déjà utilisés sur un tournoi (pour griser l'UI)
create or replace view tn_used_players as
select
  p.tournament_id,
  p.player_id,
  pl.name,
  p.round as used_in_round,
  p.points
from tn_picks p
join tn_players pl on pl.id = p.player_id;

-- =====================================================================
-- RLS — lecture publique, écritures réservées à la service role
--
-- L'app n'a pas d'authentification : la clé publique (anon) ne sert qu'à
-- LIRE. Aucune policy insert/update/delete n'est créée, donc seule la
-- service role — qui contourne RLS et ne vit que côté serveur — écrit.
-- Voir supabase/migrations/0001_rls_lecture_publique.sql pour la bascule
-- d'une base existante.
-- =====================================================================
alter table tn_players     enable row level security;
alter table tn_tournaments enable row level security;
alter table tn_matches     enable row level security;
alter table tn_picks       enable row level security;
alter table tn_projections enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tn_players','tn_tournaments','tn_matches',
                           'tn_picks','tn_projections']
  loop
    execute format(
      'drop policy if exists %I on %I', t || '_all', t);
    execute format(
      'drop policy if exists %I on %I', t || '_read', t);
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      t || '_read', t);
  end loop;
end $$;

-- Lecture seule aussi au niveau des privilèges SQL (service_role non touché).
revoke all on table
  tn_players, tn_tournaments, tn_matches, tn_picks, tn_projections
  from anon, authenticated;
grant select on table
  tn_players, tn_tournaments, tn_matches, tn_picks, tn_projections
  to anon, authenticated;

-- Sans SECURITY INVOKER, une vue s'exécute avec les droits de son
-- propriétaire et contourne la RLS des tables sous-jacentes.
alter view tn_tournament_summary set (security_invoker = on);
alter view tn_used_players       set (security_invoker = on);
grant select on tn_tournament_summary, tn_used_players to anon, authenticated;

-- tn_recompute_picks écrit : pas appelable en RPC avec la clé publique.
revoke all on function tn_recompute_picks(uuid)
  from public, anon, authenticated;
revoke all on function tn_score_match(jsonb, boolean, text, integer)
  from public, anon, authenticated;
