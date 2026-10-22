-- =====================================================================
-- IMPORT DEPUIS L'API TENNIS (Matchstat, abonnement RapidAPI)
--
-- 1. tn_import_auto.mode accepte 'api' : le tableau est lu par le SERVEUR
--    dans l'API (ATP comme WTA), sans page web ni userscript. Le cron
--    (workflow GitHub) s'en charge toutes les ~6 h.
--
-- 2. tn_player_source_ids : correspondance identifiant de la source ->
--    joueur déjà en base. La source a ses propres identifiants (numériques,
--    différents des ID officiels ATP/WTA) et donne l'état civil complet
--    (« Maria Camila Osorio Serrano ») là où la base garde le nom d'usage
--    (« C. Osorio »). Le rapprochement par nom n'est fait QU'UNE fois ; la
--    correspondance est ensuite mémorisée ici, pour ne plus dépendre du nom.
--    Régime PRIVÉ, comme tn_import_auto (0026) : lue et écrite côté serveur
--    seulement (service role), aucune lecture publique.
--
-- 3. tn_odds / tn_odds_historique : colonnes cote_a / cote_b (cotes
--    décimales RÉELLES, marge du bookmaker comprise). Les cotes de The Odds
--    API n'étaient gardées que sous forme de probabilités sans marge ; celles
--    de l'API tennis arrivent avec le tableau, sans requête de plus, et
--    permettent enfin de calculer un vrai bilan de paris. Colonnes nullables :
--    aucune ligne existante n'est modifiée. La lecture publique de ces tables
--    (0008, 0020) couvre les nouvelles colonnes.
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

-- 1. Mode 'api' -------------------------------------------------------
alter table tn_import_auto drop constraint if exists tn_import_auto_mode_check;
alter table tn_import_auto
  add constraint tn_import_auto_mode_check check (mode in ('serveur', 'navigateur', 'api'));

-- 2. Correspondance des identifiants ----------------------------------
create table if not exists tn_player_source_ids (
  source      text not null check (source in ('matchstat')),
  tour        text not null check (tour in ('ATP', 'WTA')),
  source_id   text not null,
  player_id   text not null references tn_players(id) on delete cascade,
  nom_source  text,
  created_at  timestamptz not null default now(),
  primary key (source, tour, source_id)
);

create index if not exists idx_tn_player_source_ids_joueur on tn_player_source_ids (player_id);

alter table tn_player_source_ids enable row level security;
revoke all on table tn_player_source_ids from anon, authenticated;

-- Homonymes connues (lib/matching.ts, HOMONYMES_CONNUS) : les deux « X. Wang »
-- ne peuvent pas être départagées par le nom. Correspondance établie sur
-- Wuhan 2026, présent dans les deux sources : 1er tour, position 13, Xiyu
-- Wang (source 43872) bat Xinyu Wang (47152) 6-2 6-0 ; en base, 326160 bat
-- 326376 sur ce même match, puis 326160 joue le 2e tour, comme 43872.
insert into tn_player_source_ids (source, tour, source_id, player_id, nom_source)
select v.source, v.tour, v.source_id, v.player_id, v.nom_source
from (values
  ('matchstat', 'WTA', '43872', '326160', 'Xiyu Wang'),
  ('matchstat', 'WTA', '47152', '326376', 'Xinyu Wang')
) as v(source, tour, source_id, player_id, nom_source)
where exists (select 1 from tn_players p where p.id = v.player_id)
on conflict (source, tour, source_id) do nothing;

-- 3. Cotes réelles ----------------------------------------------------
alter table tn_odds add column if not exists cote_a numeric check (cote_a is null or cote_a > 1);
alter table tn_odds add column if not exists cote_b numeric check (cote_b is null or cote_b > 1);
alter table tn_odds_historique add column if not exists cote_a numeric check (cote_a is null or cote_a > 1);
alter table tn_odds_historique add column if not exists cote_b numeric check (cote_b is null or cote_b > 1);
