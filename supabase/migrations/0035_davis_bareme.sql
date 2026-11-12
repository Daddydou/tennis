-- 0035 - Coupe Davis : barème des picks branché sur le tournoi, retrait de l'ancien module.
--
-- 1. Supprime les cinq tables tn_davis_* de la 0034 (ancien module /davis indépendant, remplacé par un
--    vrai tournoi « Coupe Davis » dont les joueurs sont des nations : tn_tournaments / tn_matches / tn_picks).
-- 2. tn_score_davis : barème des picks de la Coupe Davis. C'est le barème classique avec les MATCHS d'une
--    rencontre à la place des sets (miroir SQL de pointsPickCote, lib/davis.ts, testé là-bas) :
--      - rencontre gagnée : 5 points ;
--      - 3 points par match d'écart (gagnés - perdus), plancher 0 ;
--      - pour chaque match GAGNÉ par la nation : son écart de jeux (jeux gagnés - perdus, plancher 0 MATCH PAR
--        MATCH) ; forfait = aucun jeu ; abandon = seuls les sets entièrement joués comptent.
--    Les matchs d'une rencontre sont rangés dans tn_matches.sets, un élément par match :
--      {"g1":1,"g2":0,"ordre":1,"statut":"termine|forfait|abandon","jeux":[{"g1":6,"g2":3},...]}
--    (g1/g2 = 1/0 ou 0/1 : qui a gagné le match ; jeux = sets du côté 1 contre le côté 2). Un élément sans
--    « jeux » (score de rencontre repris tel quel d'ailleurs, « 2-1 ») est ignoré : seul le point de victoire compte.
-- 3. tn_recompute_picks : un tournoi aux tours exacts QF, SF, F (la Coupe Davis, seul tableau de 8) utilise
--    tn_score_davis ; tous les autres tournois gardent EXACTEMENT le calcul précédent.

drop table if exists public.tn_davis_pronos;
drop table if exists public.tn_davis_bracket;
drop table if exists public.tn_davis_picks;
drop table if exists public.tn_davis_matchs;
drop table if exists public.tn_davis_rencontres;

create or replace function public.tn_score_davis(p_sets jsonb, p_cote integer, p_won boolean, p_status text)
returns table(pts_match integer, pts_sets integer, pts_games integer, pts_total integer)
language plpgsql
immutable
as $function$
declare
  v_el        jsonb;
  v_set       jsonb;
  v_g1        integer;
  v_g2        integer;
  v_haut      integer;
  v_bas       integer;
  v_pour      integer;
  v_contre    integer;
  v_diff      integer;
  v_victoires integer := 0;
  v_defaites  integer := 0;
  v_jeux      integer := 0;
  v_match     integer := 0;
  v_pmatchs   integer := 0;
begin
  -- Rencontre sans issue connue : aucun point.
  if p_status in ('bye','scheduled','live','in_progress') then
    return query select 0, 0, 0, 0;
    return;
  end if;

  -- Rencontre perdue/gagnée par forfait : seul le point de victoire compte, aucun match n'a été joué.
  if p_status <> 'walkover' then
    for v_el in select * from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb))
    loop
      -- Élément sans détail (« jeux » absent) : ignoré.
      if jsonb_typeof(v_el->'jeux') is distinct from 'array' then
        continue;
      end if;
      if (v_el->>'g1')::integer > (v_el->>'g2')::integer then
        -- le côté 1 a gagné le match
        if p_cote = 1 then v_victoires := v_victoires + 1; else v_defaites := v_defaites + 1; end if;
      else
        if p_cote = 2 then v_victoires := v_victoires + 1; else v_defaites := v_defaites + 1; end if;
      end if;

      -- Écart de jeux : seulement sur un match gagné par la nation, hors forfait.
      if ((v_el->>'g1')::integer > (v_el->>'g2')::integer) = (p_cote = 1)
         and coalesce(v_el->>'statut', 'termine') <> 'forfait' then
        v_diff := 0;
        for v_set in select * from jsonb_array_elements(v_el->'jeux')
        loop
          v_g1 := (v_set->>'g1')::integer;
          v_g2 := (v_set->>'g2')::integer;
          if v_g1 is null or v_g2 is null then
            continue;
          end if;
          -- Abandon : un set interrompu n'est pas « entièrement joué » (même règle que tn_score_match).
          if coalesce(v_el->>'statut', 'termine') = 'abandon' then
            v_haut := greatest(v_g1, v_g2);
            v_bas  := least(v_g1, v_g2);
            if v_haut < 6 or not (v_haut - v_bas >= 2 or (v_haut = 7 and v_bas = 6)) then
              continue;
            end if;
          end if;
          if p_cote = 1 then v_pour := v_g1; v_contre := v_g2; else v_pour := v_g2; v_contre := v_g1; end if;
          v_diff := v_diff + (v_pour - v_contre);
        end loop;
        v_jeux := v_jeux + greatest(0, v_diff);
      end if;
    end loop;
  end if;

  if p_won then
    v_match := 5;
  end if;
  v_pmatchs := greatest(0, v_victoires - v_defaites) * 3;

  return query select v_match, v_pmatchs, v_jeux, v_match + v_pmatchs + v_jeux;
end;
$function$;

create or replace function public.tn_recompute_picks(p_tournament_id uuid)
returns integer
language plpgsql
as $function$
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
  v_davis       boolean;
begin
  select best_of, start_date, coalesce(rounds = array['QF','SF','F']::text[], false)
    into v_best_of, v_start_date, v_davis
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

    v_won := (v_match.winner_id = v_pick.player_id);

    if v_davis then
      -- Coupe Davis : les matchs de la rencontre à la place des sets.
      select * into v_score
      from tn_score_davis(v_match.sets,
                          case when v_match.player1_id = v_pick.player_id then 1 else 2 end,
                          v_won, v_match.status);
    else
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

      select * into v_score
      from tn_score_match(coalesce(v_sets,'[]'::jsonb), v_won,
                          v_match.status, coalesce(v_best_of,3),
                          v_pts_forfait);
    end if;

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
$function$;

-- Comme tn_score_match : fonction interne, appelable par la service role seulement.
revoke execute on function public.tn_score_davis(jsonb, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.tn_score_davis(jsonb, integer, boolean, text) to service_role;
