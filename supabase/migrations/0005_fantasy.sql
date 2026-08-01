-- =====================================================================
-- FANTASY — CACHE DES ESPÉRANCES PAR JOUEUR SUR TOUT LE TOURNOI
--
-- Le jeu Fantasy compose une équipe figée pour tout le tournoi : chaque
-- joueur y porte UNE espérance globale (somme de ses espérances par tour,
-- pondérées par le multiplicateur du tour), là où les picks raisonnent
-- tour par tour.
--
-- Cette table est un cache, au même titre que `tn_projections` : elle est
-- entièrement dérivable de la simulation Monte Carlo et des matchs joués.
-- On la stocke pour ne pas recharger toute la projection à chaque
-- affichage, et parce que la ventilation par tour (`detail`) est ce que
-- l'écran montre au clic sur un joueur.
--
-- Comme `tn_projections`, elle est indexée par `from_round` : la
-- simulation part des survivants réels du tour courant, donc l'espérance
-- change à chaque tour joué.
--
-- La composition de l'équipe elle-même (quel joueur pour quel palier)
-- n'est PAS stockée : c'est une affectation instantanée sur ces
-- espérances (cf. lib/fantasy.ts), et la figer en base la rendrait
-- périmée au premier changement de barème ou de paliers.
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

create table if not exists tn_fantasy (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tn_tournaments(id) on delete cascade,
  from_round    text not null,                    -- tour de départ de la simulation
  player_id     text not null references tn_players(id),

  e_total       numeric not null,                 -- espérance sur tout le tournoi
  detail        jsonb   not null default '[]',    -- ventilation tour par tour

  computed_at   timestamptz default now(),

  unique (tournament_id, from_round, player_id)
);

create index if not exists idx_tn_fantasy_lookup
  on tn_fantasy(tournament_id, from_round, e_total desc);

-- ---------------------------------------------------------------------
-- RLS — même régime que les autres tables tn_* (cf. 0001) :
-- lecture publique, écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table tn_fantasy enable row level security;

drop policy if exists tn_fantasy_read on tn_fantasy;
create policy tn_fantasy_read on tn_fantasy
  for select to anon, authenticated using (true);

revoke all on table tn_fantasy from anon, authenticated;
grant select on table tn_fantasy to anon, authenticated;
