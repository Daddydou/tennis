-- 0033 : la vue tn_used_players s'exécute avec les droits de l'appelant.
--
-- Constat (révision du 06/11) : le conseiller de sécurité Supabase la signale
-- en « security definer view » (reloptions vide). Elle avait perdu l'option
-- security_invoker posée en 0001 quand la migration 0014 l'a recréée. Les
-- tables sous-jacentes (tn_picks, tn_players) sont déjà en lecture publique,
-- donc la lecture anonyme continue de fonctionner. Aucune donnée touchée ;
-- l'app ne lit pas cette vue (voir MIGRATIONS.md).

alter view public.tn_used_players set (security_invoker = on);

grant select on public.tn_used_players to anon, authenticated;
