-- =====================================================================
-- JEU DES PICKS : UN FORFAIT GAGNÉ VAUT 10 POINTS (à partir de Shanghai 2026)
--
-- Règle : un pick dont le joueur GAGNE par forfait (status = 'walkover') vaut
-- 10 points secs (points_match = 10, points_sets = 0, points_games = 0) au
-- lieu de 5, pour tout tournoi
--   - commencé le 2026-10-05 ou après (départ du Masters 1000 de Shanghai),
--   - ET en 3 sets gagnants (best_of = 3 ; les Grands Chelems masculins en 5
--     sets gardent 5 points).
-- Inchangés : tout tournoi antérieur, les abandons (ret.), le perdant d'un
-- forfait, tout match qui n'est pas un forfait.
--
-- Source unique côté TS : lib/picksRegles.ts (`pointsForfaitPour`). Son
-- miroir SQL est `tn_points_forfait` ci-dessous ; les deux doivent rester
-- identiques (lib/__tests__/picksRegles.test.ts relit ce fichier).
--
-- PÉRIMÈTRE : les picks seulement. `tn_score_match` reçoit un paramètre
-- `p_pts_forfait` dont le DÉFAUT reste 5 ; seul `tn_recompute_picks` passe la
-- valeur datée. Le Fantasy (pointsAtRound / detailReelJoueur, en TS), le
-- Bracket et les équipes figées ne passent pas par ici et ne bougent pas.
--
-- Pourquoi un DROP : ajouter un paramètre change l'identité de la fonction.
-- Un simple `create or replace` créerait une SECONDE fonction à côté de
-- l'ancienne, et tout appel à 4 arguments deviendrait ambigu. On supprime
-- donc l'ancienne signature, dans la même transaction que la recréation :
-- `tn_recompute_picks` ne se retrouve jamais sans `tn_score_match`.
--
-- AUCUN RECALCUL ICI : `tn_recompute_picks` est rejoué à part, tournoi par
-- tournoi (start_date >= 2026-10-05), après contrôle du diff avant/après.
--
-- Rejouable : `drop ... if exists` (l'ancienne signature n'existe plus au
-- second passage), `create or replace` pour le reste, revoke/grant
-- idempotents.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Points d'un forfait gagné selon le tournoi (miroir de
--    `pointsForfaitPour`). Date absente : règle historique (5).
-- ---------------------------------------------------------------------
create or replace function tn_points_forfait(
  p_start_date  date,
  p_best_of     integer
)
returns integer
language sql
immutable
as $$
  select case
    when p_start_date >= date '2026-10-05' and coalesce(p_best_of, 3) = 3
      then 10
    else 5
  end;
$$;

-- ---------------------------------------------------------------------
-- 2. Barème d'un match : identique à 0013, plus `p_pts_forfait` (défaut 5)
--    pour le point de match d'un forfait gagné. Miroir de `scoreMatch`
--    (lib/scoring.ts), les deux doivent rester identiques.
-- ---------------------------------------------------------------------
drop function if exists tn_score_match(jsonb, boolean, text, integer);

create or replace function tn_score_match(
  p_sets        jsonb,      -- [{"g1":6,"g2":4}, ...] du point de vue du joueur
  p_won         boolean,
  p_status      text,
  p_best_of     integer default 3,
  p_pts_forfait integer default 5   -- forfait gagné ; cf. tn_points_forfait
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
  v_set         jsonb;
  v_g1          integer;
  v_g2          integer;
  v_haut        integer;
  v_bas         integer;
  v_match       integer := 0;
  v_psets       integer := 0;
  v_pgames      integer := 0;
begin
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
    -- Abandon : un set entamé puis coupé net par l'abandon (2-1, 0-0...)
    -- n'est pas « entièrement joué » — ni gagné ni perdu, on l'ignore.
    if p_status = 'retired' then
      v_haut := greatest(v_g1, v_g2);
      v_bas  := least(v_g1, v_g2);
      if v_haut < 6 or not (v_haut - v_bas >= 2 or (v_haut = 7 and v_bas = 6)) then
        continue;
      end if;
    end if;
    if v_g1 > v_g2 then
      v_sets_won  := v_sets_won + 1;
      v_net_games := v_net_games + (v_g1 - v_g2);   -- sets gagnés seulement
    else
      v_sets_lost := v_sets_lost + 1;
    end if;
  end loop;

  -- Points de victoire : `p_pts_forfait` sur un forfait gagné, 5 sinon
  if p_won then
    if p_status = 'walkover' then
      v_match := coalesce(p_pts_forfait, 5);
    else
      v_match := 5;
    end if;
  end if;

  -- Net sets, plancher à 0
  v_psets := greatest(0, v_sets_won - v_sets_lost) * 3;

  -- Net games, plancher à 0
  v_pgames := greatest(0, v_net_games);

  -- Walkover (w/o) : le match n'a pas eu lieu, aucun set n'est parcouru
  -- ci-dessus — v_psets et v_pgames valent déjà 0, seul le point de match
  -- compte.
  -- Abandon (ret.) : seuls les sets entièrement joués sont parcourus
  -- ci-dessus, donc v_psets/v_pgames ne portent déjà que sur ces sets,
  -- symétriquement pour le vainqueur et le perdant.

  return query select v_match, v_psets, v_pgames, v_match + v_psets + v_pgames;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Recalcul des picks d'un tournoi : identique à la version en place,
--    plus la lecture de `start_date` et le passage de `tn_points_forfait`.
-- ---------------------------------------------------------------------
create or replace function tn_recompute_picks(p_tournament_id uuid)
returns integer
language plpgsql
as $$
declare
  v_pick        record;
  v_match       record;
  v_sets        jsonb;
  v_won         boolean;
  v_score       record;
  v_count       integer := 0;
  v_best_of     integer;
  v_start_date  date;
  v_pts_forfait integer;
begin
  select best_of, start_date into v_best_of, v_start_date
  from tn_tournaments where id = p_tournament_id;

  v_pts_forfait := tn_points_forfait(v_start_date, coalesce(v_best_of,3));

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
                        v_match.status, coalesce(v_best_of,3),
                        v_pts_forfait);

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

-- ---------------------------------------------------------------------
-- 4. Droits (comme 0001) : EXECUTE réservé à postgres (propriétaire) et à
--    service_role. La nouvelle signature de tn_score_match et
--    tn_points_forfait naissent avec les droits par défaut du schéma public
--    (anon compris) : on les retire explicitement.
-- ---------------------------------------------------------------------
revoke all on function tn_score_match(jsonb, boolean, text, integer, integer)
  from public, anon, authenticated;
revoke all on function tn_points_forfait(date, integer)
  from public, anon, authenticated;
revoke all on function tn_recompute_picks(uuid)
  from public, anon, authenticated;

grant execute on function tn_score_match(jsonb, boolean, text, integer, integer)
  to service_role;
grant execute on function tn_points_forfait(date, integer)
  to service_role;
grant execute on function tn_recompute_picks(uuid)
  to service_role;

commit;
