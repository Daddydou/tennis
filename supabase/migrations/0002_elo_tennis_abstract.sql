-- =====================================================================
-- ELO TENNIS ABSTRACT — SOURCE EXTERNE
--
-- Les Elo maison (colonnes elo_* de tn_players) sont calculés sur les
-- seuls tournois importés dans cette app : quelques dizaines de matchs,
-- donc bruités. Tennis Abstract publie chaque semaine des Elo calculés
-- sur 52 semaines de circuit (tour-level, qualifs, challengers, ITF 50K+).
-- On les stocke ici et on s'en sert en priorité ; les Elo maison
-- deviennent un repli.
--
-- Les deux tables sont indexées sur le nom NORMALISÉ (cf. lib/matching.ts) :
-- Tennis Abstract ne publie pas les IDs ATP, le rapprochement se fait donc
-- par le nom. `ta_name_exceptions` rattrape les cas que la normalisation
-- ne résout pas (ordre nom/prénom inversé, homonymes).
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Elo publiés par Tennis Abstract
-- ---------------------------------------------------------------------
create table if not exists ta_elo (
  id                 bigserial primary key,
  ta_name            text not null,   -- nom tel qu'affiché par Tennis Abstract
  ta_name_normalized text not null,   -- clé de rapprochement (lib/matching.ts)
  tour               text not null check (tour in ('atp','wta')),
  elo_overall        numeric,
  elo_hard           numeric,
  elo_clay           numeric,
  elo_grass          numeric,
  atp_rank           integer,         -- rang officiel ATP/WTA repris du rapport
  updated_at         date,            -- « Last update » du rapport TA
  unique (ta_name_normalized, tour)
);

create index if not exists idx_ta_elo_nom_tour
  on ta_elo (ta_name_normalized, tour);

-- ---------------------------------------------------------------------
-- 2. Exceptions de correspondance de noms
--    Consultée AVANT le rapprochement automatique.
-- ---------------------------------------------------------------------
create table if not exists ta_name_exceptions (
  atp_name_normalized text primary key,  -- clé côté tn_players
  ta_name_normalized  text not null,     -- clé côté ta_elo
  tour                text not null check (tour in ('atp','wta'))
);

-- ---------------------------------------------------------------------
-- 3. RLS — même régime que les tables tn_* (cf. 0001) : lecture publique,
--    écritures réservées à la service role.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ta_elo','ta_name_exceptions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      t || '_read', t);
  end loop;
end $$;

revoke all on table ta_elo, ta_name_exceptions from anon, authenticated;
grant select on table ta_elo, ta_name_exceptions to anon, authenticated;

-- `id` est un bigserial : sans droit sur la séquence, même la service role
-- passe, mais on retire explicitement l'accès aux rôles publics.
revoke all on sequence ta_elo_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Exceptions connues au 2026-07-27
--    Cas que la normalisation ne peut pas résoudre seule.
-- ---------------------------------------------------------------------
insert into ta_name_exceptions (atp_name_normalized, ta_name_normalized, tour)
values
  -- Tennis Abstract écrit les joueurs chinois nom-prénom (« Bu Yunchaokete »),
  -- l'ATP prénom-nom (« Y. Bu ») : aucune normalisation ne les rapproche.
  ('y bu', 'b yunchaokete', 'atp')
on conflict (atp_name_normalized) do update
  set ta_name_normalized = excluded.ta_name_normalized,
      tour = excluded.tour;
