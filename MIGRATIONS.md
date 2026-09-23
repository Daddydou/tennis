# Migrations Supabase

Les 19 fichiers de `supabase/migrations/`, à jouer **dans l'ordre**, une seule
fois chacun (éditeur SQL Supabase, ou `scripts/appliquer-migration.mjs`).

Aucune table de suivi n'enregistre ce qui a été appliqué : la colonne
« appliquée le » se remplit à la main. Pour la remplir, lancer dans l'éditeur
SQL la [requête de contrôle globale](#contrôle-global--les-19-en-une-requête),
ou la requête de la migration concernée ([détail](#une-requête-par-migration)).

« Créée le » est la date d'ajout du fichier dans Git : une migration n'a pas pu
être appliquée **avant** cette date.

| N°   | Fichier                                  | Ce qu'elle fait                                                  | Créée le   | Appliquée le |
|------|------------------------------------------|------------------------------------------------------------------|------------|--------------|
| 0001 | `0001_rls_lecture_publique.sql`          | RLS : lecture publique, écritures réservées à la service role    | 2026-07-26 |              |
| 0002 | `0002_elo_tennis_abstract.sql`           | Tables `ta_elo` et `ta_name_exceptions`                          | 2026-07-27 |              |
| 0003 | `0003_elo_identite_par_slug.sql`         | Identité Tennis Abstract par slug — **vide `ta_elo`** (¹)        | 2026-07-27 |              |
| 0004 | `0004_exceptions_par_circuit.sql`        | Clé d'exception = nom + circuit                                  | 2026-07-27 |              |
| 0005 | `0005_fantasy.sql`                       | Table de cache `tn_fantasy`                                      | 2026-08-01 |              |
| 0006 | `0006_fantasy_a_priori.sql`              | `tn_fantasy` sans `from_round` (espérance a priori)              | 2026-08-01 |              |
| 0007 | `0007_fantasy_historique.sql`            | Table `tn_fantasy_historique` (prédit / réalisé)                 | 2026-08-01 |              |
| 0008 | `0008_cotes.sql`                         | Table de cache `tn_odds` (cotes bookmakers)                      | 2026-08-02 |              |
| 0009 | `0009_statut_in_progress.sql`            | Statut `in_progress` (tableaux en direct)                        | 2026-08-03 |              |
| 0010 | `0010_elo_historique.sql`                | Archive `ta_elo_historique`, fonction `ta_elo_a_la_date`         | 2026-08-21 |              |
| 0011 | `0011_corrections_joueurs.sql`           | Fusion R. Jodar, exception Kyrgios, 6 doublons sans match        | 2026-08-21 |              |
| 0012 | `0012_paliers_grand_chelem.sql`          | Nouveaux paliers GC — supprime l'historique Fantasy GC (²)       | 2026-08-29 |              |
| 0013 | `0013_bareme_walkover_abandon.sql`       | Barème w/o et abandon corrigé dans `tn_score_match` (²)          | 2026-09-08 |              |
| 0014 | `0014_participants.sql`                  | Table `tn_participants`, colonne `tn_picks.participant_id`       | 2026-09-08 |              |
| 0015 | `0015_bracket_predictions.sql`           | Table `tn_bracket_predictions` — **remplacée par 0016** (³)      | 2026-09-08 |              |
| 0016 | `0016_simulateur_ancre_et_picks.sql`     | Table `tn_bracket_anchors` — **remplacée par 0018** (³)          | 2026-09-08 |              |
| 0017 | `0017_simulateur_picks.sql`              | Table `tn_simulated_picks` (bac à sable de picks)                | 2026-09-08 |              |
| 0018 | `0018_simulateur_bracket_par_tour.sql`   | Table `tn_bracket_round_picks` (bracket un tour à la fois)       | 2026-09-09 |              |
| 0019 | `0019_fusion_identites_wta.sql`          | Fusion de 9 identités WTA dupliquées (US Open 2026)              | 2026-09-13 |              |

(¹) Après 0003, repeupler `ta_elo` depuis `/import/elo` : la migration la vide
et seul un import la remplit.

(²) Après 0012 et après 0013, rejouer le **backfill Fantasy** (écran
Calibration) : ces migrations suppriment des lignes de `tn_fantasy_historique`
que seul le backfill réécrit.

(³) 0016 supprime la table de 0015, et 0018 celle de 0016. Une fois 0018
appliquée, les deux ne laissent plus aucune trace : la requête les signale
« remplacée », ce qui compte comme appliquée (rejouer 0015 ou 0016 après
coup recréerait une table morte, à ne pas faire).

---

## Contrôle global : les 19 en une requête

À coller tel quel dans l'éditeur SQL. Lecture seule : ne modifie rien.
Une ligne par migration, colonne `etat` = `appliquée`, `remplacée`,
`NON appliquée` ou `invérifiable`.

> Si elle échoue avec `relation "ta_name_exceptions" does not exist`, c'est que
> 0002 n'est pas appliquée : utiliser alors les requêtes une par une ci-dessous.

```sql
with c(num, ok, note) as (values
  ('0001',
   exists (select 1 from pg_policies where tablename = 'tn_players' and policyname = 'tn_players_read')
   and not exists (select 1 from pg_policies where tablename = 'tn_players' and policyname = 'tn_players_all'),
   null),
  ('0002',
   to_regclass('public.ta_elo') is not null and to_regclass('public.ta_name_exceptions') is not null,
   null),
  ('0003',
   exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'ta_elo' and column_name = 'ta_slug'),
   null),
  ('0004',
   coalesce((select array_length(conkey, 1) = 2 from pg_constraint
             where conname = 'ta_name_exceptions_pkey'), false),
   null),
  ('0005', to_regclass('public.tn_fantasy') is not null, null),
  ('0006',
   to_regclass('public.tn_fantasy') is not null
   and not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'tn_fantasy' and column_name = 'from_round'),
   null),
  ('0007', to_regclass('public.tn_fantasy_historique') is not null, null),
  ('0008', to_regclass('public.tn_odds') is not null, null),
  ('0009',
   coalesce((select pg_get_constraintdef(oid) like '%in_progress%' from pg_constraint
             where conname = 'tn_matches_status_check'), false),
   null),
  ('0010',
   to_regclass('public.ta_elo_historique') is not null
   and to_regprocedure('public.ta_elo_a_la_date(text,date)') is not null,
   null),
  ('0011',
   exists (select 1 from ta_name_exceptions
           where atp_name_normalized = 'n kyrgios' and tour = 'atp' and ta_slug = 'NickKyrgios')
   and not exists (select 1 from tn_players where id = 'SR:COMPETITOR:972327'),
   null),
  ('0012', null::boolean,
   'suppression pure, aucune trace : voir la requête 0012 ci-dessous'),
  ('0013',
   coalesce(pg_get_functiondef(to_regprocedure('public.tn_score_match(jsonb,boolean,text,integer)'))
            like '%coup_ net%', false),
   null),
  ('0014',
   to_regclass('public.tn_participants') is not null
   and exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'tn_picks' and column_name = 'participant_id'),
   null),
  ('0015',
   to_regclass('public.tn_bracket_predictions') is not null,
   case when to_regclass('public.tn_bracket_anchors') is not null
          or to_regclass('public.tn_bracket_round_picks') is not null
        then 'remplacée' end),
  ('0016',
   to_regclass('public.tn_bracket_anchors') is not null,
   case when to_regclass('public.tn_bracket_round_picks') is not null
        then 'remplacée' end),
  ('0017', to_regclass('public.tn_simulated_picks') is not null, null),
  ('0018', to_regclass('public.tn_bracket_round_picks') is not null, null),
  ('0019',
   not exists (select 1 from tn_players
               where id in ('460837','501894','845268','906723','721779',
                            '325729','380396','18251','679319')),
   null)
)
select num,
       case when ok then 'appliquée'
            when note = 'remplacée' then 'remplacée'
            when ok is null then 'invérifiable'
            else 'NON appliquée' end as etat,
       case when note <> 'remplacée' then note end as remarque
from c
order by num;
```

---

## Une requête par migration

Chacune renvoie une seule valeur `appliquee` : `true` ou `false`. Toutes sont
en lecture seule.

### 0001 — RLS lecture publique
La policy de lecture existe, l'ancienne policy « tout pour authenticated » a
disparu.
```sql
select exists (select 1 from pg_policies where tablename = 'tn_players' and policyname = 'tn_players_read')
   and not exists (select 1 from pg_policies where tablename = 'tn_players' and policyname = 'tn_players_all')
   as appliquee;
```
Contrôle complet, toutes tables : `npm run verify:rls` (voir README).

### 0002 — Tables Tennis Abstract
```sql
select to_regclass('public.ta_elo') is not null
   and to_regclass('public.ta_name_exceptions') is not null as appliquee;
```

### 0003 — Identité par slug
La colonne `ta_slug` existe dans `ta_elo`.
```sql
select exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'ta_elo' and column_name = 'ta_slug')
   as appliquee;
```
Si `true`, vérifier aussi que `ta_elo` a été repeuplée : `select count(*) from ta_elo;`
(0 = refaire un import depuis `/import/elo`).

### 0004 — Exceptions par circuit
La clé primaire de `ta_name_exceptions` porte sur **deux** colonnes (nom + circuit).
```sql
select coalesce((select array_length(conkey, 1) = 2 from pg_constraint
                 where conname = 'ta_name_exceptions_pkey'), false) as appliquee;
```

### 0005 — Cache Fantasy
```sql
select to_regclass('public.tn_fantasy') is not null as appliquee;
```

### 0006 — Fantasy a priori
La colonne `from_round` a été retirée de `tn_fantasy`.
```sql
select to_regclass('public.tn_fantasy') is not null
   and not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'tn_fantasy' and column_name = 'from_round')
   as appliquee;
```

### 0007 — Historique Fantasy
```sql
select to_regclass('public.tn_fantasy_historique') is not null as appliquee;
```

### 0008 — Cotes
```sql
select to_regclass('public.tn_odds') is not null as appliquee;
```

### 0009 — Statut `in_progress`
La contrainte de statut des matchs accepte `in_progress`.
```sql
select coalesce((select pg_get_constraintdef(oid) like '%in_progress%' from pg_constraint
                 where conname = 'tn_matches_status_check'), false) as appliquee;
```

### 0010 — Historique Elo
La table d'archive et la fonction `ta_elo_a_la_date` existent.
```sql
select to_regclass('public.ta_elo_historique') is not null
   and to_regprocedure('public.ta_elo_a_la_date(text,date)') is not null as appliquee;
```

### 0011 — Corrections de joueurs
Migration de **données** : on cherche l'exception Kyrgios qu'elle insère, et
l'absence de l'ID Sportradar de R. Jodar qu'elle supprime.
```sql
select exists (select 1 from ta_name_exceptions
               where atp_name_normalized = 'n kyrgios' and tour = 'atp' and ta_slug = 'NickKyrgios')
   and not exists (select 1 from tn_players where id = 'SR:COMPETITOR:972327')
   as appliquee;
```

### 0012 — Paliers du Grand Chelem
**Invérifiable de façon certaine** : elle ne fait que supprimer des lignes de
`tn_fantasy_historique`, et le backfill les réécrit ensuite. On vérifie donc
plutôt **son but** : qu'aucune ligne Grand Chelem ne date de l'ancien découpage
des paliers. Chaque écriture d'une ligne (`enregistrerHistorique`,
`db/fantasy.ts`) recalcule la composition avec le code du moment et remet
`computed_at` à jour : une ligne écrite après le 2026-08-29 est donc juste,
qu'elle ait été supprimée par la migration ou simplement recalculée depuis.
```sql
select count(*)                                   as lignes_gc,
       min(h.computed_at)                         as plus_ancienne,
       bool_and(h.computed_at >= date '2026-08-29') as toutes_apres_0012
from tn_fantasy_historique h
join tn_tournaments t on t.id = h.tournament_id
where t.category = 'GS' or (t.category is null and coalesce(t.draw_size, 0) >= 128);
```
- `toutes_apres_0012 = true` → rien de périmé : considérer 0012 comme faite.
- `false` → au moins une ligne GC date de l'ancien découpage : jouer 0012, puis
  le backfill.
- `lignes_gc = 0` → soit elle a été jouée **sans** backfill, soit aucun Grand
  Chelem n'a d'historique : dans les deux cas, rejouer le backfill.

### 0013 — Barème walkover / abandon
La fonction `tn_score_match` contient le commentaire propre à la version
corrigée (« set entamé puis coupé net »). `coup_ net` évite tout souci d'accent.
```sql
select coalesce(pg_get_functiondef(to_regprocedure('public.tn_score_match(jsonb,boolean,text,integer)'))
                like '%coup_ net%', false) as appliquee;
```

### 0014 — Participants
```sql
select to_regclass('public.tn_participants') is not null
   and exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'tn_picks' and column_name = 'participant_id')
   as appliquee;
```

### 0015 — Bracket predictions (remplacée par 0016)
```sql
select to_regclass('public.tn_bracket_predictions') is not null as appliquee,
       to_regclass('public.tn_bracket_anchors') is not null
       or to_regclass('public.tn_bracket_round_picks') is not null as remplacee;
```
`remplacee = true` suffit : ne pas la rejouer.

### 0016 — Ancre unique (remplacée par 0018)
```sql
select to_regclass('public.tn_bracket_anchors') is not null as appliquee,
       to_regclass('public.tn_bracket_round_picks') is not null as remplacee;
```
`remplacee = true` suffit : ne pas la rejouer.

### 0017 — Picks simulés
```sql
select to_regclass('public.tn_simulated_picks') is not null as appliquee;
```

### 0018 — Bracket par tour
```sql
select to_regclass('public.tn_bracket_round_picks') is not null as appliquee;
```

### 0019 — Fusion des identités WTA
Migration de **données** : aucun des 9 « ID neufs » de l'US Open 2026 ne doit
rester dans `tn_players`.
```sql
select not exists (select 1 from tn_players
                   where id in ('460837','501894','845268','906723','721779',
                                '325729','380396','18251','679319'))
   as appliquee;
```
Limite : `true` aussi si l'US Open WTA 2026 n'a jamais été importé (les
doublons n'ont alors jamais existé, et la migration n'a rien à faire).
