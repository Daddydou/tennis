-- =====================================================================
-- FANTASY — HISTORIQUE PRÉDIT / RÉALISÉ
--
-- Une ligne par tournoi : l'espérance a priori de l'équipe optimale
-- (`e_predit`, figée dès le tirage) et ce que cette MÊME équipe a
-- réellement marqué (`score_reel`, qui monte à chaque import de
-- résultats). De quoi accumuler, tournoi après tournoi, les couples dont
-- on aura besoin pour juger la calibration du modèle.
--
-- ⚠ COLLECTE SEULEMENT. Aucun paramètre du modèle n'est dérivé de cette
-- table, ni aujourd'hui ni automatiquement demain. Sur quelques
-- tournois, l'écart prédit/réalisé est surtout du bruit : s'y ajuster
-- serait du sur-apprentissage. La table sert à REGARDER les chiffres et
-- à décider, une fois le volume atteint.
--
-- `termine` distingue les lignes exploitables : un tournoi à mi-parcours
-- a un `score_reel` tronqué, qui tirerait toute moyenne vers le bas.
--
-- `equipe` conserve la composition retenue (palier, joueur, rang,
-- espérance, réel) : sans elle, un écart surprenant serait impossible à
-- reconstituer une fois les Elo rafraîchis et le cache invalidé.
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

create table if not exists tn_fantasy_historique (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tn_tournaments(id) on delete cascade,

  e_predit      numeric not null,                 -- espérance a priori de l'équipe
  score_reel    numeric not null default 0,       -- points réels de cette équipe
  termine       boolean not null default false,   -- tournoi allé à son terme
  equipe        jsonb   not null default '[]',    -- composition retenue

  computed_at   timestamptz default now(),

  unique (tournament_id)
);

create index if not exists idx_tn_fantasy_hist_lookup
  on tn_fantasy_historique(termine, computed_at desc);

-- ---------------------------------------------------------------------
-- RLS — même régime que les autres tables tn_* (cf. 0001) :
-- lecture publique, écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table tn_fantasy_historique enable row level security;

drop policy if exists tn_fantasy_historique_read on tn_fantasy_historique;
create policy tn_fantasy_historique_read on tn_fantasy_historique
  for select to anon, authenticated using (true);

revoke all on table tn_fantasy_historique from anon, authenticated;
grant select on table tn_fantasy_historique to anon, authenticated;
