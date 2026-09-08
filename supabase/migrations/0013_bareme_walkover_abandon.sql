-- =====================================================================
-- CORRECTION DU BARÈME WALKOVER / ABANDON
--
-- Règles officielles du jeu :
--   - Forfait (w/o) : le match n'a pas eu lieu. Le vainqueur marque +5 pts
--     de base UNIQUEMENT. Aucun bonus de set ni de dominance.
--   - Abandon (ret.) : seuls les sets ENTIÈREMENT joués avant l'abandon
--     sont comptés ; mêmes règles pour le vainqueur et le perdant sur ces
--     sets.
--
-- DEUX BUGS CORRIGÉS DANS `tn_score_match` (répercutés depuis lib/scoring.ts,
-- les deux implémentations doivent rester identiques) :
--
--   1. Walkover et abandon créditaient tous deux le vainqueur d'un bonus
--      fictif — 3 pts + 2 pts par set manquant à la victoire — comme si les
--      sets non joués avaient été remportés. Un forfait bo3 valait ainsi 15
--      pts, un bo5 20 pts, au lieu des 5 pts de base seuls. Ce bonus est
--      supprimé : plus aucun crédit pour un set non joué.
--
--   2. Sur un abandon, un set ENTAMÉ PUIS COUPÉ NET (ex. 2-1, ou 0-0 quand
--      l'abandon tombe dès l'entame du set) était compté comme un set gagné
--      ou perdu par simple comparaison des jeux — alors qu'il n'est pas
--      « entièrement joué ». Il est désormais ignoré, pour le vainqueur
--      comme pour le perdant.
--
-- ---------------------------------------------------------------------
-- CE QUI DOIT ÊTRE PÉRIMÉ, ET CE QUI N'A PAS À L'ÊTRE
--
-- `tn_picks.points*` : recalculé plus bas, pour tout pick d'un tournoi
-- portant au moins un match w/o ou ret. — c'est `tn_recompute_picks` qui
-- appelle `tn_score_match`, il suffit de le rejouer.
--
-- `tn_fantasy_historique.score_reel` (et son volet `_anterieur`) : dérivé
-- de `tn_score_match` via `pointsAtRound` (lib/fantasy.ts, `detailReelJoueur`).
-- Les lignes des tournois concernés sont donc aussi périmées. Comme à la
-- migration 0012, on les supprime plutôt que de les recalculer ici : c'est
-- un calcul dérivé, entièrement reproductible, et le backfill
-- (`POST /api/fantasy/backfill`) ne reprend une ligne « terminé » que si
-- elle a disparu.
--
-- `tn_fantasy.e_total` (espérance a priori) n'est PAS touché : il vient de
-- la simulation Monte Carlo du tirage, jamais de résultats réels ni de
-- `tn_score_match`. Le barème corrigé n'y change rien.
--
-- ⚠ À FAIRE APRÈS CETTE MIGRATION : rejouer le backfill Fantasy, sans quoi
-- les tournois avec w/o ou ret. restent sans ligne d'historique.
--
-- Rejouable : `create or replace` pour la fonction, `delete` idempotent sur
-- des lignes déjà absentes, `tn_recompute_picks` rejoue le même calcul.
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

  -- Points de victoire
  if p_won then
    v_match := 5;
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
-- Recalcul des picks déjà en base, pour tout tournoi portant au moins un
-- match w/o ou ret. — les seuls que le nouveau barème peut changer.
-- ---------------------------------------------------------------------
do $$
declare
  v_t record;
begin
  for v_t in
    select distinct t.id
    from tn_tournaments t
    join tn_matches m on m.tournament_id = t.id
    where m.status in ('walkover','retired')
  loop
    perform tn_recompute_picks(v_t.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Historique Fantasy : périmer les tournois concernés (même geste qu'à la
-- migration 0012), à reconstruire par le backfill.
-- ---------------------------------------------------------------------
delete from tn_fantasy_historique h
using tn_tournaments t
where t.id = h.tournament_id
  and exists (
    select 1 from tn_matches m
    where m.tournament_id = t.id
      and m.status in ('walkover','retired')
  );
