-- =====================================================================
-- STATUT `in_progress` — TABLEAUX EN DIRECT
--
-- Le bookmarklet marque `in_progress` les matchs en train de se jouer.
-- La contrainte `tn_matches_status_check` ne connaissait que `live` :
-- importer un tableau en cours (Montréal WTA 2026, plusieurs rencontres
-- sur le court) échouait en bloc sur
--
--   new row for relation "tn_matches" violates check constraint
--   "tn_matches_status_check"
--
-- — pas seulement pour les matchs concernés : l'upsert est atomique, donc
-- 128 lignes perdues pour 4 en cours.
--
-- `live` et `in_progress` désignent la MÊME chose. On accepte les deux
-- plutôt que de réécrire l'un en l'autre à l'import : la valeur stockée
-- reste celle de la source, et les anciennes lignes `live` ne bougent pas.
--
-- CE QU'UN MATCH EN COURS VAUT : rien. Il n'a pas d'issue connue, donc
-- pas de vainqueur, et `tn_score_match` lui rend 0 comme à un match à
-- jouer — ses sets partiels ne comptent qu'une fois la rencontre finie.
-- Côté TypeScript, la même règle vit dans `STATUTS_INDECIS`
-- (lib/types.ts).
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

alter table tn_matches drop constraint if exists tn_matches_status_check;
alter table tn_matches add constraint tn_matches_status_check
  check (status in ('scheduled','live','in_progress','completed',
                    'walkover','retired','bye'));

-- ---------------------------------------------------------------------
-- SCORING — un match en cours ne rapporte aucun point.
--
-- Seule la liste des statuts sans points change ; le reste de la fonction
-- est identique à celle du schéma (schema.sql), reproduite en entier
-- parce que `create or replace function` n'accepte pas de patch partiel.
-- ---------------------------------------------------------------------
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

  -- Cas sans points : le bye, et tout match sans issue connue — un match
  -- EN COURS ('live', 'in_progress') est ici un match pas encore joué.
  if p_status in ('bye','scheduled','live','in_progress') then
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

-- `create or replace` conserve les privilèges existants ; on les réaffirme
-- pour qu'un rejeu sur une base neuve laisse la fonction hors de portée de
-- la clé publique (cf. 0001).
revoke all on function tn_score_match(jsonb, boolean, text, integer)
  from public, anon, authenticated;
