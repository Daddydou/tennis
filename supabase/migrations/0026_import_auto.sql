-- =====================================================================
-- IMPORT AUTOMATIQUE DES TABLEAUX — surveillance et journal
--
-- tn_import_auto : un tournoi « surveillé » par ligne. La ligne est créée
--   (ou mise à jour) par tout import RÉUSSI, manuel ou automatique : c'est le
--   premier import manuel qui inscrit le tournoi. Ré-import toutes les ~12 h
--   jusqu'à l'arrêt (finale importée, fin du tournoi, plafond 21 jours, ou
--   arrêt manuel depuis /import).
--     mode 'serveur'    : la page est récupérée par POST /api/import-auto/run
--                         (WTA, page rendue côté serveur) ;
--     mode 'navigateur' : extraction par le userscript Tampermonkey (ATP,
--                         protégé par Cloudflare ; WTA en repli).
--
-- tn_import_log : une ligne par tentative (succès, inchangé, échec), toutes
--   sources confondues ('manuel' = écran /import).
--
-- RLS : régime DIFFÉRENT des autres tables tn_* — AUCUNE lecture publique.
-- Ces tables ne sont lues que côté serveur, par la service role (écran
-- /import connecté, routes /api/import-auto/* à jeton). RLS activée sans
-- aucune policy + privilèges retirés à anon/authenticated : la clé publique
-- ne lit ni n'écrit rien (scripts/verifier-rls.mjs, liste TABLES_PRIVEES).
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

create table if not exists tn_import_auto (
  tournament_id       uuid primary key references tn_tournaments(id) on delete cascade,
  tour                text not null check (tour in ('ATP', 'WTA')),
  source_url          text not null,
  mode                text not null check (mode in ('serveur', 'navigateur')),
  actif               boolean not null default true,
  premier_import_at   timestamptz not null default now(),
  dernier_succes_at   timestamptz,
  dernier_hash        text,
  derniere_erreur     text,
  echecs_consecutifs  integer not null default 0 check (echecs_consecutifs >= 0),
  arrete_at           timestamptz,
  motif_arret         text check (motif_arret in ('finale_importee', 'plafond_21j', 'fin_tournoi', 'manuel')),
  created_at          timestamptz not null default now(),
  -- Un tournoi arrêté porte toujours son motif et sa date, un actif aucun des deux.
  constraint tn_import_auto_arret_coherent check (
    (actif and arrete_at is null and motif_arret is null)
    or (not actif and arrete_at is not null and motif_arret is not null)
  )
);

create table if not exists tn_import_log (
  id              bigint generated always as identity primary key,
  tournament_id   uuid references tn_tournaments(id) on delete cascade,
  source          text not null check (source in ('serveur', 'navigateur', 'manuel')),
  ok              boolean not null,
  matchs_total    integer check (matchs_total >= 0),
  matchs_changes  integer check (matchs_changes >= 0),
  avertissements  jsonb not null default '[]'::jsonb,
  erreur          text,
  duree_ms        integer check (duree_ms >= 0),
  created_at      timestamptz not null default now()
);

create index if not exists idx_tn_import_log_tournoi
  on tn_import_log (tournament_id, created_at desc);

-- RLS : activée, AUCUNE policy (ni lecture ni écriture) -> seule la service role passe.
alter table tn_import_auto enable row level security;
alter table tn_import_log enable row level security;

revoke all on table tn_import_auto from anon, authenticated;
revoke all on table tn_import_log from anon, authenticated;
