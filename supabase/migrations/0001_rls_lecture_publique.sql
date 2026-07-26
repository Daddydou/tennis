-- =====================================================================
-- RLS — LECTURE PUBLIQUE, ÉCRITURES RÉSERVÉES À LA SERVICE ROLE
--
-- Remplace les policies `for all to authenticated` du schéma initial.
-- L'app n'a pas d'authentification : la clé publique (anon / publishable)
-- sert à LIRE, et rien d'autre. Aucune policy insert/update/delete n'est
-- créée : seule la service role (qui contourne RLS, côté serveur
-- uniquement) peut écrire.
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. RLS active + policy de lecture publique sur les 5 tables
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tn_players','tn_tournaments','tn_matches',
                           'tn_picks','tn_projections']
  loop
    execute format('alter table %I enable row level security', t);

    -- Ancienne policy « tout pour authenticated » : trop large.
    execute format('drop policy if exists %I on %I', t || '_all', t);

    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      t || '_read', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Privilèges table : lecture seule pour les rôles publics
--    (ceinture + bretelles : même sans policy d'écriture, on retire le
--    droit SQL sous-jacent. `service_role` n'est pas touché.)
-- ---------------------------------------------------------------------
revoke all on table
  tn_players, tn_tournaments, tn_matches, tn_picks, tn_projections
  from anon, authenticated;

grant select on table
  tn_players, tn_tournaments, tn_matches, tn_picks, tn_projections
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Vues : SECURITY INVOKER, sinon elles s'exécutent avec les droits de
--    leur propriétaire et contournent la RLS des tables sous-jacentes.
-- ---------------------------------------------------------------------
alter view if exists tn_tournament_summary set (security_invoker = on);
alter view if exists tn_used_players       set (security_invoker = on);

grant select on tn_tournament_summary, tn_used_players to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Fonctions : le recalcul des points est une écriture. Il ne doit pas
--    être appelable en RPC avec la clé publique — uniquement depuis
--    POST /api/recompute, en service role.
-- ---------------------------------------------------------------------
revoke all on function tn_recompute_picks(uuid)
  from public, anon, authenticated;
revoke all on function tn_score_match(jsonb, boolean, text, integer)
  from public, anon, authenticated;
