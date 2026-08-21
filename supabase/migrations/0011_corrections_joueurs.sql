-- =====================================================================
-- CORRECTIONS D'IDENTITÉ DE JOUEURS
--
-- Trois anomalies relevées en parcourant `tn_players`, toutes de la même
-- famille : une PERSONNE y figure sous plusieurs LIGNES, parce que les
-- sources d'import ne partagent pas le même espace d'identifiants.
-- L'ID officiel (« J0DZ », « KE17 ») vient du bookmarklet ATP/WTA ;
-- d'autres extractions ont déposé des identifiants Sportradar
-- (« SR:COMPETITOR:972327 ») ou d'un second espace numérique WTA.
--
-- Conséquence, et raison de corriger : un joueur scindé en deux lignes a
-- deux historiques, deux Elo maison, et le rapprochement Tennis Abstract
-- ne s'accroche qu'à l'une d'elles. La seconde tombe en Elo « défaut »,
-- ce qui fausse silencieusement toute simulation où elle apparaît.
--
-- CE QUI N'EST PAS TOUCHÉ : les deux « X. Wang » (326160 et 326376) sont
-- de VRAIES homonymes, deux joueuses distinctes avec chacune leurs
-- matchs. Les fusionner créerait le bug qu'on corrige ici, en pire. Elles
-- restent séparées, et c'est `ta_name_exceptions` qui départagera leur
-- Elo si besoin (cf. migration 0003).
--
-- Idempotent : rejouable sans risque. Chaque bloc ne fait rien si la
-- correction est déjà en place.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. R. JODAR — deux lignes pour un seul joueur
--
--   J0DZ                  : ID ATP, 43 matchs sur 12 tournois, Elo TA 1961
--   SR:COMPETITOR:972327  : ID Sportradar, 2 matchs, uniquement à
--                           l'Australian Open 2026 (R128 gagné, R64 perdu)
--
-- On garde l'ID ATP : c'est celui que porte le reste de la base, et le
-- seul que le rapprochement de noms sait relier à Tennis Abstract.
--
-- Vérifié avant écriture : J0DZ n'a AUCUN match à l'Australian Open, la
-- réaffectation ne peut donc pas le faire figurer deux fois dans un même
-- tableau. La vérification est refaite en fin de migration, sur données.
-- ---------------------------------------------------------------------

-- 1.1 Matchs — les trois colonnes qui référencent un joueur.
update tn_matches set player1_id = 'J0DZ' where player1_id = 'SR:COMPETITOR:972327';
update tn_matches set player2_id = 'J0DZ' where player2_id = 'SR:COMPETITOR:972327';
update tn_matches set winner_id  = 'J0DZ' where winner_id  = 'SR:COMPETITOR:972327';

-- 1.2 Tables dérivées.
--
-- Toutes sont vides pour cet ID aujourd'hui (0 pick, 0 fantasy, 0
-- projection, 0 cote). Les collisions sont malgré tout traitées : ces
-- tables portent un unique (tournoi, joueur), et une fusion sur des
-- données différentes — un dump plus récent, un autre doublon corrigé de
-- la même façon — échouerait sans ça. On supprime la ligne SOURCE quand
-- la cible existe déjà : c'est la ligne du même joueur, en double.
delete from tn_picks s
where s.player_id = 'SR:COMPETITOR:972327'
  and exists (select 1 from tn_picks d
              where d.tournament_id = s.tournament_id and d.player_id = 'J0DZ');
update tn_picks set player_id = 'J0DZ' where player_id = 'SR:COMPETITOR:972327';

delete from tn_fantasy s
where s.player_id = 'SR:COMPETITOR:972327'
  and exists (select 1 from tn_fantasy d
              where d.tournament_id = s.tournament_id and d.player_id = 'J0DZ');
update tn_fantasy set player_id = 'J0DZ' where player_id = 'SR:COMPETITOR:972327';

delete from tn_projections s
where s.player_id = 'SR:COMPETITOR:972327'
  and exists (select 1 from tn_projections d
              where d.tournament_id = s.tournament_id
                and d.from_round is not distinct from s.from_round
                and d.player_id = 'J0DZ'
                and d.round = s.round);
update tn_projections set player_id = 'J0DZ' where player_id = 'SR:COMPETITOR:972327';

-- `tn_odds` n'a pas de contrainte d'unicité par joueur : rien à écarter.
update tn_odds set player_a_id = 'J0DZ' where player_a_id = 'SR:COMPETITOR:972327';
update tn_odds set player_b_id = 'J0DZ' where player_b_id = 'SR:COMPETITOR:972327';

-- 1.3 La ligne en double disparaît. Le `not exists` n'est pas décoratif :
--     il transforme un échec de contrainte en no-op si une référence
--     avait été oubliée ci-dessus.
delete from tn_players p
where p.id = 'SR:COMPETITOR:972327'
  and not exists (select 1 from tn_matches m
                  where m.player1_id = p.id or m.player2_id = p.id or m.winner_id = p.id)
  and not exists (select 1 from tn_picks k where k.player_id = p.id)
  and not exists (select 1 from tn_fantasy f where f.player_id = p.id)
  and not exists (select 1 from tn_projections j where j.player_id = p.id)
  and not exists (select 1 from tn_odds o
                  where o.player_a_id = p.id or o.player_b_id = p.id);

-- ---------------------------------------------------------------------
-- 2. N. KYRGIOS — exception de rapprochement
--
-- « N. Kyrgios » (Brisbane) se normalise en « n kyrgios » (cf.
-- lib/matching.ts). Aucune ligne `ta_elo` ne porte cette clé, et la
-- correspondance échoue donc en silence : le joueur retombe sur l'Elo
-- maison, puis sur le défaut.
--
-- ⚠ CE QUE CETTE LIGNE FAIT, ET CE QU'ELLE NE FAIT PAS. Le slug
-- `NickKyrgios` est vérifié à la source (player.cgi?p=NickKyrgios répond
-- 200, « Nick Kyrgios Match Results »). Mais le RAPPORT Elo, lui, ne le
-- publie pas : le rapport ATP du 2026-08-10 compte 554 joueurs, aucun
-- Kyrgios. Tennis Abstract n'y fait figurer que les joueurs à plus de dix
-- matchs sur 52 semaines, seuil sous lequel une longue absence fait
-- sortir. `ta_elo` est donc fidèle à sa source, et cette exception ne
-- change RIEN aujourd'hui — l'écran Picks continuera d'afficher un Elo
-- « défaut » pour lui.
--
-- Elle est posée quand même parce qu'elle décrit une IDENTITÉ, pas une
-- valeur : le jour où Kyrgios rejoue assez pour reparaître au rapport,
-- son Elo s'accrochera tout seul, sans qu'il faille se souvenir de cette
-- ligne. `chercherCorrespondance` traite déjà le cas d'un slug absent du
-- rapport en poursuivant le rapprochement automatique (cf. matching.ts) :
-- une exception qui ne pointe sur rien est inerte, jamais nuisible.
-- ---------------------------------------------------------------------
insert into ta_name_exceptions (atp_name_normalized, ta_name_normalized, ta_slug, tour)
values ('n kyrgios', null, 'NickKyrgios', 'atp')
on conflict (atp_name_normalized, tour) do update
  set ta_name_normalized = excluded.ta_name_normalized,
      ta_slug = excluded.ta_slug;

-- ---------------------------------------------------------------------
-- 3. SIX LIGNES SANS AUCUN MATCH — doublons d'un second espace d'ID
--
-- Chacune de ces six joueuses existe DEUX FOIS : une ligne peuplée, avec
-- ses matchs, et une ligne créée le 2026-07-27 qui n'a jamais rien
-- référencé. Ce ne sont pas des joueuses absentes du circuit, ce sont des
-- doublons d'identifiant.
--
--   à supprimer          conservée (matchs)
--   845268 A. Korneeva   331330 (4)
--   501894 D. Vidmanova  329057 (1)
--   460837 J. Tjen       328818 (4)
--   906723 L. Tagger     332150 (1)
--   721779 N. Bartunkova 330364 (5)
--   325729 O. Oliynykova 327182 (3)
--
-- Rien à réaffecter : ces lignes n'ont ni match, ni pick, ni fantasy, ni
-- projection, ni cote. La suppression ne perd donc aucune donnée — elle
-- retire des identités qui n'en portaient aucune.
--
-- La condition `not exists` garde la suppression sûre si une référence
-- apparaissait d'ici l'exécution : mieux vaut une ligne en trop qu'une
-- référence cassée. La base compte par ailleurs une cinquantaine de
-- lignes sans match (joueuses vues aux cotes, tableaux non importés) :
-- elles ne sont PAS touchées, seules ces six-là sont des doublons avérés.
-- ---------------------------------------------------------------------
delete from tn_players p
where p.id in ('845268', '501894', '460837', '906723', '721779', '325729')
  and not exists (select 1 from tn_matches m
                  where m.player1_id = p.id or m.player2_id = p.id or m.winner_id = p.id)
  and not exists (select 1 from tn_picks k where k.player_id = p.id)
  and not exists (select 1 from tn_fantasy f where f.player_id = p.id)
  and not exists (select 1 from tn_projections j where j.player_id = p.id)
  and not exists (select 1 from tn_odds o
                  where o.player_a_id = p.id or o.player_b_id = p.id);

-- ---------------------------------------------------------------------
-- 4. CONTRÔLE — un joueur deux fois dans le même tableau
--
-- La fusion du point 1 est la seule opération capable de produire ce
-- défaut. On le cherche sur TOUTE la base, pas seulement sur J0DZ : si un
-- autre doublon existait déjà, autant l'apprendre maintenant. La
-- migration échoue plutôt que de laisser passer un tableau incohérent.
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
