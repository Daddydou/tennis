-- =====================================================================
-- HISTORISATION DES ELO TENNIS ABSTRACT
--
-- `ta_elo` ne garde qu'un INSTANTANÉ : le dernier import écrase le
-- précédent. Utilisable pour prédire un match à venir, cet état courant
-- ne l'est pas pour juger un match passé — l'Elo d'aujourd'hui intègre
-- déjà le résultat qu'on prétend prédire. Le vainqueur en est ressorti
-- relevé, le perdant abaissé : a posteriori, le « favori » d'une affiche
-- est en partie désigné PAR son résultat. C'est un biais de look-ahead,
-- et il fausse dans un sens connu (favori trop souvent gagnant) la
-- calibration des cotes comme le backfill fantasy.
--
-- On archive donc chaque rapport importé. Une ligne d'archive est datée
-- du rapport lui-même (« Last update » de Tennis Abstract), pas de
-- l'heure d'import : c'est la date à laquelle ces Elo étaient VRAIS.
-- Évaluer un match revient alors à charger le dernier instantané
-- STRICTEMENT antérieur à la rencontre.
--
-- IDENTITÉ D'UNE LIGNE : (tour, releve_le, ta_slug). Réimporter deux
-- fois le même rapport hebdomadaire met à jour la même ligne au lieu
-- d'empiler des doublons ; deux rapports de semaines différentes
-- cohabitent, c'est tout l'objet de la table.
--
-- CE QUI NE CHANGE PAS : `ta_elo` reste la table COURANTE, et c'est
-- elle que lisent les picks, le fantasy en direct et la simulation.
-- Utiliser l'Elo du jour pour prédire un match à venir n'est pas un
-- biais, c'est la seule chose à faire. L'archive ne sert qu'aux écrans
-- de MESURE.
--
-- CE QU'ELLE NE PEUT PAS FAIRE : reconstituer le passé. Tennis Abstract
-- ne publie que le rapport de la semaine ; l'archive part donc de
-- l'instantané courant et n'accumule que vers l'avant. Aucun tournoi
-- déjà en base n'aura d'Elo antérieur — l'évaluation « propre » ne
-- portera que sur les tournois à venir. C'est une collecte qui commence
-- aujourd'hui, pas un historique qu'on récupère.
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Archive datée des rapports Elo
--
-- Mêmes colonnes que `ta_elo`, plus la date du relevé. On duplique au
-- lieu de normaliser : une ligne d'archive est un FAIT figé (« au 27
-- juillet, ce joueur valait 1987 »), qui ne doit pas se mettre à jour
-- quand le nom ou le rang du joueur évolue dans la table courante.
-- ---------------------------------------------------------------------
create table if not exists ta_elo_historique (
  id                 bigserial primary key,

  -- Date du rapport Tennis Abstract, pas celle de l'import : c'est elle
  -- qui situe ces Elo dans le temps.
  releve_le          date not null,

  ta_slug            text not null,   -- identité TA (player.cgi?p=…)
  ta_name            text not null,
  ta_name_normalized text not null,   -- clé de rapprochement (lib/matching.ts)
  tour               text not null check (tour in ('atp','wta')),

  elo_overall        numeric,
  elo_hard           numeric,
  elo_clay           numeric,
  elo_grass          numeric,
  atp_rank           integer,

  -- Quand la ligne a été écrite ici. Diagnostic : un écart important
  -- avec `releve_le` signale un rapport importé en retard.
  archive_le         timestamptz not null default now(),

  unique (tour, releve_le, ta_slug)
);

-- L'index de la contrainte unique sert les deux seules lectures de la
-- table : trouver le dernier relevé avant une date (préfixe tour,
-- releve_le) et charger tout un instantané (tour, releve_le). Pas
-- d'index supplémentaire à maintenir.

-- ---------------------------------------------------------------------
-- 2. Amorçage depuis la table courante
--
-- L'instantané d'aujourd'hui est le seul passé récupérable : on le
-- verse dans l'archive, daté du rapport dont il vient. Sans ça, le
-- premier instantané n'existerait qu'au prochain import.
-- ---------------------------------------------------------------------
insert into ta_elo_historique (
  releve_le, ta_slug, ta_name, ta_name_normalized, tour,
  elo_overall, elo_hard, elo_clay, elo_grass, atp_rank
)
select
  coalesce(updated_at, current_date),
  ta_slug, ta_name, ta_name_normalized, tour,
  elo_overall, elo_hard, elo_clay, elo_grass, atp_rank
from ta_elo
on conflict (tour, releve_le, ta_slug) do nothing;

-- ---------------------------------------------------------------------
-- 3. Lecture : l'Elo de chaque joueur À UNE DATE
--
-- Pas « le dernier rapport avant la date » mais, pour CHAQUE joueur, sa
-- dernière valeur connue avant la date. La nuance n'est pas cosmétique :
-- un rapport hebdomadaire ne republie que les joueurs à plus de dix
-- matchs sur 52 semaines, et un blessé en sort. Prendre le rapport tel
-- quel priverait ces joueurs d'Elo alors qu'on en a un, un peu plus
-- ancien — exactement la règle que `ta_elo` applique déjà en ne
-- supprimant jamais un joueur absent du rapport de la semaine.
--
-- `releve_le` est renvoyée avec chaque ligne : c'est l'âge de la valeur,
-- et il doit rester lisible par l'appelant.
--
-- STRICTEMENT antérieur (`<`, pas `<=`) : Tennis Abstract republie en
-- début de semaine, et un rapport daté du jour d'un match peut déjà
-- l'avoir intégré. C'est précisément ce qu'on cherche à exclure.
--
-- `distinct on` en SQL plutôt qu'en TypeScript : sans lui il faudrait
-- rapatrier toute l'archive (~1 100 lignes par semaine, cumulées) pour
-- n'en garder qu'une par joueur.
-- ---------------------------------------------------------------------
create or replace function ta_elo_a_la_date(p_tour text, p_date date)
returns table (
  ta_name            text,
  ta_name_normalized text,
  ta_slug            text,
  tour               text,
  elo_overall        numeric,
  elo_hard           numeric,
  elo_clay           numeric,
  elo_grass          numeric,
  atp_rank           integer,
  releve_le          date
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select distinct on (h.ta_slug)
    h.ta_name, h.ta_name_normalized, h.ta_slug, h.tour,
    h.elo_overall, h.elo_hard, h.elo_clay, h.elo_grass, h.atp_rank,
    h.releve_le
  from ta_elo_historique h
  where h.tour = p_tour
    and h.releve_le < p_date
  order by h.ta_slug, h.releve_le desc
$$;

revoke all on function ta_elo_a_la_date(text, date) from public;
grant execute on function ta_elo_a_la_date(text, date) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS — même régime que `ta_elo` (cf. 0002) : lecture publique,
--    écritures réservées à la service role.
-- ---------------------------------------------------------------------
alter table ta_elo_historique enable row level security;

drop policy if exists ta_elo_historique_read on ta_elo_historique;
create policy ta_elo_historique_read on ta_elo_historique
  for select to anon, authenticated using (true);

revoke all on table ta_elo_historique from anon, authenticated;
grant select on table ta_elo_historique to anon, authenticated;
revoke all on sequence ta_elo_historique_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Volet « sans look-ahead » de l'historique Fantasy
--
-- `tn_fantasy_historique` garde le couple prédit/réalisé calculé sur
-- l'Elo COURANT — celui de l'app en production, qu'on ne touche pas.
-- Les colonnes ci-dessous accueillent le même couple recalculé sur
-- l'instantané précédant le tirage : autres Elo, donc souvent une autre
-- équipe optimale, donc un autre score réel. Les deux se lisent côte à
-- côte, jamais l'un à la place de l'autre.
--
-- Toutes nullables, et NULL veut dire quelque chose : aucun instantané
-- ne précède ce tournoi, il n'entre pas dans l'évaluation propre. C'est
-- le cas de tous les tournois déjà en base (cf. en-tête).
-- ---------------------------------------------------------------------
alter table tn_fantasy_historique
  add column if not exists e_predit_anterieur   numeric;
alter table tn_fantasy_historique
  add column if not exists score_reel_anterieur numeric;
alter table tn_fantasy_historique
  add column if not exists equipe_anterieure    jsonb;

-- Relevé effectivement utilisé. Renseigné ⇒ les trois colonnes
-- ci-dessus le sont aussi : de quoi savoir sur quel Elo l'évaluation
-- propre a été faite, et la refaire si le rapport était douteux.
alter table tn_fantasy_historique
  add column if not exists elo_releve_le        date;

-- Nombre de joueurs du tableau absents de cet instantané, retombés sur
-- l'Elo par défaut. Un tableau de 128 en compte toujours quelques-uns
-- (qualifiés, invités) : la valeur se regarde, elle ne disqualifie pas
-- la ligne — mais une évaluation où la moitié du tableau est par défaut
-- ne vaut rien, et il faut pouvoir le voir.
alter table tn_fantasy_historique
  add column if not exists joueurs_sans_elo     integer;

grant select on table tn_fantasy_historique to anon, authenticated;
