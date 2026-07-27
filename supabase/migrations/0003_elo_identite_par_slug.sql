-- =====================================================================
-- ELO TENNIS ABSTRACT — IDENTITÉ PAR SLUG
--
-- `ta_name_normalized` n'identifie pas un joueur : deux homonymes s'y
-- réduisent (« Andrej Martin » et « Andres Martin » → « a martin »,
-- « Darwin Blanch » et « Dali Blanch » → « d blanch »). La contrainte
-- unique sur cette clé n'en gardait qu'un, et le « A. Martin » de
-- Washington (Andres, USA) héritait de l'Elo d'Andrej (SVK).
--
-- Tennis Abstract expose un identifiant stable dans l'URL de chaque
-- joueur : player.cgi?p=AndresMartin. C'est lui l'identité.
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Identité TA sur ta_elo
--
-- `country` : la page Elo ne publie AUCUN pays (colonnes : Elo Rank,
-- Player, Age, Elo, hElo, cElo, gElo, Peak, ATP Rank, Log diff). La
-- colonne est créée pour ne pas refaire une migration si le rapport
-- évolue, mais l'import la laisse à null — le pays ne peut donc pas
-- servir à désambiguïser deux homonymes. Le slug, lui, le peut.
-- ---------------------------------------------------------------------
alter table ta_elo add column if not exists ta_slug text;
alter table ta_elo add column if not exists country text;

-- Les lignes existantes ont été importées sans slug et une seule des deux
-- lignes d'un homonyme a survécu à l'ancienne contrainte : elles sont
-- inexploitables. On repart de zéro — `POST /api/elo/refresh` les
-- réimporte toutes, slug compris.
delete from ta_elo;

alter table ta_elo drop constraint if exists ta_elo_ta_name_normalized_tour_key;
alter table ta_elo alter column ta_slug set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ta_elo_ta_slug_tour_key'
  ) then
    alter table ta_elo add constraint ta_elo_ta_slug_tour_key unique (ta_slug, tour);
  end if;
end $$;

-- `ta_name_normalized` reste indexé : c'est la clé de RAPPROCHEMENT, elle
-- n'est simplement plus une clé d'IDENTITÉ.
create index if not exists idx_ta_elo_nom_tour on ta_elo (ta_name_normalized, tour);

-- ---------------------------------------------------------------------
-- 2. Exceptions ciblant un slug
--
-- Une exception « clé normalisée → clé normalisée » ne peut pas départager
-- deux homonymes : ils ont la même clé des deux côtés. Elle désigne
-- désormais un slug.
-- ---------------------------------------------------------------------
alter table ta_name_exceptions add column if not exists ta_slug text;

-- `ta_name_normalized` devient facultatif : les exceptions par slug s'en
-- passent. Les anciennes lignes (ordre nom/prénom inversé) le gardent.
alter table ta_name_exceptions alter column ta_name_normalized drop not null;

alter table ta_name_exceptions drop constraint if exists ta_name_exceptions_cible;
alter table ta_name_exceptions add constraint ta_name_exceptions_cible
  check (ta_slug is not null or ta_name_normalized is not null);

-- ---------------------------------------------------------------------
-- 3. Exceptions connues au 2026-07-27
-- ---------------------------------------------------------------------
insert into ta_name_exceptions (atp_name_normalized, ta_name_normalized, ta_slug, tour)
values
  -- Homonyme : « A. Martin » du tableau de Washington est Andres Martin
  -- (USA, ~250), pas Andrej Martin (SVK). Les deux se normalisent en
  -- « a martin » : seul le slug tranche.
  ('a martin', null, 'AndresMartin', 'atp'),

  -- Tennis Abstract écrit les joueurs chinois nom-prénom (« Bu Yunchaokete »),
  -- l'ATP prénom-nom (« Y. Bu ») : aucune normalisation ne les rapproche.
  ('y bu', 'b yunchaokete', 'BuYunchaokete', 'atp')
on conflict (atp_name_normalized) do update
  set ta_name_normalized = excluded.ta_name_normalized,
      ta_slug = excluded.ta_slug,
      tour = excluded.tour;

-- ---------------------------------------------------------------------
-- 4. Droits (la table a de nouvelles colonnes, les grants restent)
-- ---------------------------------------------------------------------
grant select on table ta_elo, ta_name_exceptions to anon, authenticated;
