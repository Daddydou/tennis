-- =====================================================================
-- ELO MAISON — notes calculées sur 36 ans d'historique, mises à jour chaque jour
--
-- tn_elo_maison : une ligne par joueur (ATP / WTA). Deux groupes de colonnes :
--   1. AU FORMAT ta_elo (ta_name, ta_name_normalized, ta_slug, country, tour,
--      elo_overall, elo_hard, elo_clay, elo_grass, atp_rank, updated_at) : l'app
--      les lit EXACTEMENT comme les Elo Tennis Abstract (même rapprochement par
--      nom, même formule 0,6 surface / 0,4 général, même échelle 400), d'où un
--      simple choix de source dans db/elo.ts. Les valeurs sont transformées pour
--      que cette formule redonne la probabilité de l'Elo maison
--      (lib/eloMaison.ts, `colonnesApp`).
--   2. L'ÉTAT du moteur (notes brutes, nombres de matchs, dernier match),
--      nécessaire pour la mise à jour quotidienne (db/eloMaison.ts).
--   `ta_slug` porte la clé de l'historique (« ATP:s126203 » archive Sackmann,
--   « WTA:m45866 » API tennis) ; `matchstat_id` l'identifiant de l'API, pour
--   rattacher les nouveaux résultats sans repasser par le nom.
--
-- tn_elo_maison_suivi : par circuit, dernier jour de résultats traité.
--
-- RLS : régime commun (lecture publique, écriture service role uniquement),
-- comme ta_elo. Idempotent : rejouable sans risque.
-- =====================================================================

create table if not exists tn_elo_maison (
  ta_slug             text primary key,
  tour                text not null check (tour in ('atp', 'wta')),
  ta_name             text not null,
  ta_name_normalized  text not null,
  country             text,
  matchstat_id        text,
  elo_overall         numeric not null,
  elo_hard            numeric not null,
  elo_clay            numeric not null,
  elo_grass           numeric not null,
  atp_rank            integer,
  note_generale       numeric not null,
  note_dur            numeric not null,
  note_terre          numeric not null,
  note_gazon          numeric not null,
  note_moquette       numeric not null,
  n                   integer not null default 0 check (n >= 0),
  n_dur               integer not null default 0,
  n_terre             integer not null default 0,
  n_gazon             integer not null default 0,
  n_moquette          integer not null default 0,
  dernier_jour        integer not null,
  updated_at          date not null default current_date
);

create unique index if not exists idx_tn_elo_maison_matchstat on tn_elo_maison (tour, matchstat_id) where matchstat_id is not null;
create index if not exists idx_tn_elo_maison_nom on tn_elo_maison (tour, ta_name_normalized);

create table if not exists tn_elo_maison_suivi (
  tour                 text primary key check (tour in ('atp', 'wta')),
  dernier_jour_traite  date not null,
  matchs_traites       integer not null default 0,
  version              text not null,
  mis_a_jour           timestamptz not null default now()
);

alter table tn_elo_maison enable row level security;
alter table tn_elo_maison_suivi enable row level security;

drop policy if exists tn_elo_maison_read on tn_elo_maison;
create policy tn_elo_maison_read on tn_elo_maison for select to anon, authenticated using (true);
drop policy if exists tn_elo_maison_suivi_read on tn_elo_maison_suivi;
create policy tn_elo_maison_suivi_read on tn_elo_maison_suivi for select to anon, authenticated using (true);

revoke all on table tn_elo_maison from anon, authenticated;
grant select on table tn_elo_maison to anon, authenticated;
revoke all on table tn_elo_maison_suivi from anon, authenticated;
grant select on table tn_elo_maison_suivi to anon, authenticated;
