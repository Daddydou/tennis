-- =====================================================================
-- HISTORIQUE DES COTES — UNE LIGNE PAR CAPTURE, JAMAIS ÉCRASÉE
--
-- `tn_odds` (0008) ne garde qu'une PHOTO par rencontre : chaque
-- rafraîchissement remplace la précédente (unique tournament_id,
-- event_id). Impossible d'y lire l'évolution d'une cote avant le match.
--
-- Cette table, elle, ACCUMULE : chaque clic sur « rafraîchir les cotes »
-- (POST /api/cotes/refresh) y ajoute une ligne par rencontre, horodatée.
-- Rien d'automatique — aucune tâche planifiée ne consomme le quota
-- gratuit de The Odds API (500 requêtes/mois) : il y a autant de points
-- sur la courbe que de captures faites à la main.
--
-- Même contenu que `tn_odds` (probabilités déjà dévigorisées, consensus
-- médian des bookmakers), sans contrainte d'unicité : deux captures du
-- même match sont précisément ce qu'on veut garder.
--
-- MESURE SEULEMENT : rien dans les picks, le fantasy ou la simulation ne
-- lit cette table. Elle n'alimente que le graphique d'évolution de
-- /calibration/cotes.
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

create table if not exists tn_odds_historique (
  id             bigserial primary key,
  tournament_id  uuid not null references tn_tournaments(id) on delete cascade,
  event_id       text not null,
  commence_time  timestamptz,

  nom_a          text not null,
  nom_b          text not null,
  player_a_id    text references tn_players(id),
  player_b_id    text references tn_players(id),

  proba_a        numeric,
  proba_b        numeric,
  bookmakers     integer not null default 0,

  capture_le     timestamptz not null default now()
);

-- Seule lecture : toutes les captures d'un tournoi, par rencontre et dans
-- l'ordre du temps.
create index if not exists idx_tn_odds_historique_tournoi
  on tn_odds_historique(tournament_id, event_id, capture_le);

-- ---------------------------------------------------------------------
-- RLS — même régime que les autres tables tn_* (cf. 0001) :
-- lecture publique, écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table tn_odds_historique enable row level security;

drop policy if exists tn_odds_historique_read on tn_odds_historique;
create policy tn_odds_historique_read on tn_odds_historique
  for select to anon, authenticated using (true);

revoke all on table tn_odds_historique from anon, authenticated;
grant select on table tn_odds_historique to anon, authenticated;
