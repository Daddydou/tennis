-- =====================================================================
-- COTES BOOKMAKERS — CACHE POUR L'ÉVALUATION DU BLEND
--
-- Table de CACHE, pas de production : rien dans les picks, le fantasy ou
-- la simulation ne la lit. Elle n'alimente qu'un écran de mesure
-- (/calibration/cotes), dont la question est : mélanger les cotes du
-- marché à l'Elo améliore-t-il les prédictions, avant d'envisager de le
-- brancher ?
--
-- POURQUOI UN CACHE. The Odds API est plafonnée à 500 requêtes par mois
-- sur le palier gratuit. Sans cache, le simple affichage de l'écran
-- consommerait le quota ; ici, seul un clic explicite appelle l'API
-- (`POST /api/cotes/refresh`), et l'écran ne lit plus que cette table.
--
-- POURQUOI IL FAUT CAPTURER AVANT LE MATCH. Le palier gratuit ne donne
-- accès qu'aux cotes des rencontres à venir ou en cours — l'historique
-- est payant. Une ligne écrite ici est donc une PHOTO, seule trace
-- exploitable une fois le tournoi terminé et les résultats importés.
-- C'est ce qui rend le cache indispensable, et pas seulement économe.
--
-- `proba_a` / `proba_b` sont déjà DÉVIGORISÉES (marge du bookmaker
-- retirée, somme = 1) et agrégées sur les bookmakers disponibles — la
-- médiane, moins sensible qu'une moyenne à un book décalé. On garde
-- `bookmakers` pour savoir sur combien de cotes repose la valeur : une
-- probabilité issue d'un seul book ne vaut pas celle issue de dix.
--
-- Les noms bruts de l'API sont conservés (`nom_a`, `nom_b`) même quand
-- le rapprochement échoue : `player_a_id` à NULL est un signalement, pas
-- une ligne à jeter. L'écran les liste — un match non apparié doit se
-- voir, sinon l'évaluation porte silencieusement sur un sous-ensemble.
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

create table if not exists tn_odds (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tn_tournaments(id) on delete cascade,

  -- Identité de la rencontre chez The Odds API.
  event_id       text not null,
  sport_key      text not null,
  commence_time  timestamptz,

  -- Noms tels que renvoyés par l'API, avant rapprochement.
  nom_a          text not null,
  nom_b          text not null,

  -- Joueurs appariés en base. NULL = rapprochement échoué, à signaler.
  player_a_id    text references tn_players(id),
  player_b_id    text references tn_players(id),

  -- Probabilités dévigorisées et agrégées. proba_a + proba_b = 1.
  proba_a        numeric,
  proba_b        numeric,
  bookmakers     integer not null default 0,

  recupere_le    timestamptz not null default now(),

  -- Une seule ligne par rencontre et par tournoi : un rafraîchissement
  -- met à jour la photo au lieu d'empiler les doublons.
  unique (tournament_id, event_id)
);

create index if not exists idx_tn_odds_tournoi on tn_odds(tournament_id);

-- ---------------------------------------------------------------------
-- RLS — même régime que les autres tables tn_* (cf. 0001) :
-- lecture publique, écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table tn_odds enable row level security;

drop policy if exists tn_odds_read on tn_odds;
create policy tn_odds_read on tn_odds
  for select to anon, authenticated using (true);

revoke all on table tn_odds from anon, authenticated;
grant select on table tn_odds to anon, authenticated;
