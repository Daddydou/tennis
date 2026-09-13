-- =====================================================================
-- FUSION DE 9 IDENTITÉS WTA DUPLIQUÉES — RÉCURRENCE DU DÉFAUT 0011
--
-- Même famille d'anomalie que la migration 0011 (R. Jodar, ID ATP vs
-- Sportradar) : une PERSONNE existe sous plusieurs LIGNES `tn_players`,
-- parce que le site du circuit sert, pour une joueuse non classée ou
-- qualifiée, un second espace d'identifiants numérique au lieu de son ID
-- habituel. Le bookmarklet reprend cet ID tel quel, et `app/import/
-- actions.ts` créait jusqu'ici une ligne neuve sans jamais chercher si la
-- personne existait déjà — exactement la cause que ce même correctif de
-- session vient de fermer côté import (`lib/parser.ts`
-- `reconcilierIdsJoueurs`). Cette migration ne fait que rattraper les
-- neuf doublons déjà écrits par l'import de l'US Open 2026 (WTA) avant
-- que le correctif n'existe.
--
--   joueuse            ID historique (Canada/Cincinnati/Guadalajara)   ID neuf (US Open)
--   J. Tjen             328818                                         460837
--   D. Vidmanova         329057                                         501894
--   A. Korneeva          331330                                         845268
--   L. Tagger            332150                                         906723
--   N. Bartunkova        330364                                         721779
--   O. Oliynykova        327182                                         325729
--   E. Kalieva           327834                                         380396
--   V. Williams          230220                                         18251
--   M. Stoiana           330265                                         679319
--
-- Vérifié avant écriture (scripts jetables, cf. session) : l'ID neuf de
-- chacune n'apparaît QUE sur l'US Open, l'ID historique jamais sur l'US
-- Open — aucune collision possible sur les contraintes d'unicité par
-- tournoi. `tn_bracket_round_picks` (migration 0018, postérieure à 0011)
-- et `tn_simulated_picks` (0017) sont couvertes ici, contrairement à 0011
-- qui ne pouvait pas encore les connaître.
--
-- CE QUI N'EST PAS TOUCHÉ : les deux « X. Wang » (326160 et 326376) sont
-- de VRAIES homonymes, déjà documentées et volontairement séparées en
-- migration 0011. Rien ici ne les concerne.
--
-- Idempotent : rejouable sans risque, chaque étape ne fait rien si la
-- fusion est déjà en place.
-- =====================================================================

do $$
declare
  paire record;
begin
  for paire in
    select * from (values
      ('460837', '328818'), -- J. Tjen
      ('501894', '329057'), -- D. Vidmanova
      ('845268', '331330'), -- A. Korneeva
      ('906723', '332150'), -- L. Tagger
      ('721779', '330364'), -- N. Bartunkova
      ('325729', '327182'), -- O. Oliynykova
      ('380396', '327834'), -- E. Kalieva
      ('18251',  '230220'), -- V. Williams
      ('679319', '330265')  -- M. Stoiana
    ) as t(nouveau, ancien)
  loop
    -- tn_matches — les trois colonnes qui référencent un joueur. Unique
    -- par (tournoi, round, position), jamais par joueur : aucun conflit
    -- possible en réécrivant l'ID.
    update tn_matches set player1_id = paire.ancien where player1_id = paire.nouveau;
    update tn_matches set player2_id = paire.ancien where player2_id = paire.nouveau;
    update tn_matches set winner_id  = paire.ancien where winner_id  = paire.nouveau;

    -- tn_picks — unique par (tournoi, stock, joueur) : la ligne SOURCE
    -- (ID neuf) disparaît si la CIBLE (ID historique, même tournoi, même
    -- stock) existe déjà, pour ne jamais violer la contrainte.
    delete from tn_picks s
    where s.player_id = paire.nouveau
      and exists (
        select 1 from tn_picks d
        where d.tournament_id = s.tournament_id
          and d.player_id = paire.ancien
          and d.participant_id is not distinct from s.participant_id
      );
    update tn_picks set player_id = paire.ancien where player_id = paire.nouveau;

    -- tn_fantasy — unique (tournoi, joueur).
    delete from tn_fantasy s
    where s.player_id = paire.nouveau
      and exists (select 1 from tn_fantasy d
                  where d.tournament_id = s.tournament_id and d.player_id = paire.ancien);
    update tn_fantasy set player_id = paire.ancien where player_id = paire.nouveau;

    -- tn_projections — unique (tournoi, from_round, joueur, round). Cache
    -- Monte Carlo pur : une collision ici perdrait juste une entrée déjà
    -- périmée, jamais une donnée saisie.
    delete from tn_projections s
    where s.player_id = paire.nouveau
      and exists (select 1 from tn_projections d
                  where d.tournament_id = s.tournament_id
                    and d.player_id = paire.ancien
                    and d.round = s.round
                    and d.from_round is not distinct from s.from_round);
    update tn_projections set player_id = paire.ancien where player_id = paire.nouveau;

    -- tn_odds — aucune contrainte d'unicité par joueur (cf. migration 0011).
    update tn_odds set player_a_id = paire.ancien where player_a_id = paire.nouveau;
    update tn_odds set player_b_id = paire.ancien where player_b_id = paire.nouveau;

    -- tn_simulated_picks — mêmes contraintes que tn_picks (migration 0017).
    delete from tn_simulated_picks s
    where s.player_id = paire.nouveau
      and exists (
        select 1 from tn_simulated_picks d
        where d.tournament_id = s.tournament_id
          and d.player_id = paire.ancien
          and d.participant_id is not distinct from s.participant_id
      );
    update tn_simulated_picks set player_id = paire.ancien where player_id = paire.nouveau;

    -- tn_bracket_round_picks (migration 0018) — unique par (tournoi,
    -- stock, round, position), JAMAIS par joueur : un pronostic de bracket
    -- peut viser le même joueur à plusieurs emplacements sans conflit,
    -- aucune déduplication n'est donc nécessaire ici.
    update tn_bracket_round_picks set player_id = paire.ancien where player_id = paire.nouveau;

    -- La ligne en double disparaît, seulement si plus aucune table ne la
    -- référence encore (garde défensive : ne doit normalement plus rien
    -- trouver après les étapes ci-dessus).
    delete from tn_players p
    where p.id = paire.nouveau
      and not exists (select 1 from tn_matches m
                      where m.player1_id = p.id or m.player2_id = p.id or m.winner_id = p.id)
      and not exists (select 1 from tn_picks k where k.player_id = p.id)
      and not exists (select 1 from tn_fantasy f where f.player_id = p.id)
      and not exists (select 1 from tn_projections j where j.player_id = p.id)
      and not exists (select 1 from tn_odds o where o.player_a_id = p.id or o.player_b_id = p.id)
      and not exists (select 1 from tn_simulated_picks sp where sp.player_id = p.id)
      and not exists (select 1 from tn_bracket_round_picks brp where brp.player_id = p.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- CONTRÔLE — un joueur deux fois dans le même tour d'un même tableau.
-- Même garde que la migration 0011 (§5), rejouée ici : seule une fusion
-- ratée peut produire ce défaut. La migration échoue plutôt que de
-- laisser passer un tableau incohérent.
-- ---------------------------------------------------------------------
do $$
declare
  fautifs text;
begin
  select string_agg(format('%s / %s : %s fois au tour %s',
                           t.name, x.player_id, x.n, x.round), ' | ')
    into fautifs
  from (
    select m.tournament_id, m.round, j.player_id, count(*) as n
    from tn_matches m
    cross join lateral (values (m.player1_id), (m.player2_id)) as j(player_id)
    where j.player_id is not null
    group by m.tournament_id, m.round, j.player_id
    having count(*) > 1
  ) x
  join tn_tournaments t on t.id = x.tournament_id;

  if fautifs is not null then
    raise exception 'Joueur présent plusieurs fois dans un même tour : %', fautifs;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- CONTRÔLE — plus aucun doublon de nom évident (même circuit, même clé
-- de rapprochement, IDs différents) hors les homonymies déjà connues.
-- Signale sans échouer : un vrai homonyme futur ne doit pas bloquer une
-- migration, seulement se voir dans les logs Supabase.
-- ---------------------------------------------------------------------
do $$
declare
  restants text;
begin
  select string_agg(format('%s (%s) : %s', x.cle, x.tour, x.ids), ' | ')
    into restants
  from (
    select
      lower(regexp_replace(trim(regexp_replace(p.name, '\.', ' ', 'g')), '\s+', ' ', 'g')) as cle,
      p.tour,
      string_agg(p.id, ', ') as ids,
      count(*) as n
    from tn_players p
    group by 1, 2
    having count(*) > 1
  ) x;

  if restants is not null then
    raise notice 'Doublons de nom restants (à vérifier, pas forcément un bug — cf. X. Wang) : %', restants;
  end if;
end $$;
