-- =====================================================================
-- EXCEPTIONS DE NOMS — UNE CLÉ PAR CIRCUIT
--
-- `ta_name_exceptions` était identifiée par `atp_name_normalized` SEUL :
-- une clé ne pouvait donc exister que pour un circuit. Or les deux
-- espaces de noms se recouvrent — « a martin » est déjà pris par Andres
-- Martin (ATP), et rien n'interdit qu'une joueuse se réduise à la même
-- clé. L'exception WTA correspondante était alors impossible à insérer,
-- ou pire, écrasait celle de l'ATP en changeant son `tour` (le
-- `on conflict do update` de la migration 0002 le faisait explicitement).
--
-- L'identité d'une exception est donc (clé, circuit). Les lectures
-- filtraient déjà sur `tour` (cf. supabase/elo.ts) : rien d'autre à
-- changer côté application.
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'ta_name_exceptions'
      and c.contype = 'p'
      and c.conkey = array[
        (select attnum from pg_attribute
          where attrelid = t.oid and attname = 'atp_name_normalized')
      ]::smallint[]
  ) then
    alter table ta_name_exceptions drop constraint ta_name_exceptions_pkey;
    alter table ta_name_exceptions
      add constraint ta_name_exceptions_pkey
      primary key (atp_name_normalized, tour);
  end if;
end $$;
