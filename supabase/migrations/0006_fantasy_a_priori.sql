-- =====================================================================
-- FANTASY — ESPÉRANCE A PRIORI, UNE SEULE ENTRÉE DE CACHE PAR TOURNOI
--
-- `tn_fantasy` était indexée par `from_round`, calquée sur
-- `tn_projections` : l'espérance repartait du tour courant et comptait les
-- tours déjà joués en points réels, comme le jeu des picks.
--
-- C'est faux pour le Fantasy. L'équipe s'y compose UNE SEULE FOIS avant le
-- coup d'envoi, puis reste figée : la bonne question n'est pas « que
-- rapportera cette équipe compte tenu de ce qui est joué », mais « quelle
-- équipe fallait-il composer au vu du tirage ». L'espérance part donc
-- toujours du premier tour, tableau complet, sans aucun résultat réel — et
-- ne dépend plus de l'avancée du tournoi.
--
-- Il n'y a dès lors plus qu'un seul jeu de valeurs par tournoi :
-- `from_round` disparaît, et l'identité d'une ligne devient
-- (tournoi, joueur).
--
-- Le cache est vidé : les lignes existantes ont été calculées avec les
-- résultats réels injectés, et sont donc à recalculer de toute façon.
-- Elles se repeuplent seules au premier affichage.
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

delete from tn_fantasy;

-- Emporte au passage la contrainte d'unicité et l'index qui la référençaient.
alter table tn_fantasy drop column if exists from_round;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'tn_fantasy'
      and c.contype = 'u'
      and c.conkey = array[
        (select attnum from pg_attribute
          where attrelid = t.oid and attname = 'tournament_id'),
        (select attnum from pg_attribute
          where attrelid = t.oid and attname = 'player_id')
      ]::smallint[]
  ) then
    alter table tn_fantasy
      add constraint tn_fantasy_tournament_id_player_id_key
      unique (tournament_id, player_id);
  end if;
end $$;

drop index if exists idx_tn_fantasy_lookup;
create index if not exists idx_tn_fantasy_lookup
  on tn_fantasy(tournament_id, e_total desc);
