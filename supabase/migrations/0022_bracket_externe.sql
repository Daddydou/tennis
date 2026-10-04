-- =====================================================================
-- BRACKET EXTERNE — copie en lecture seule de l'app bracket de Thomas
--
-- Alimentée UNIQUEMENT par scripts/sync-bracket-thomas.mts (déclenchement
-- manuel, aucun cron). Rien dans le moteur (picks, fantasy, simulateur) ne
-- lit ces tables ; aucun écran pour l'instant.
--
-- Tout s'indexe par POSITION DE TABLEAU (1..draw_size), jamais par nom de
-- joueur. Le format source est exemple-api-tennis-brackets.json.
--
-- Écarts par rapport au schéma proposé, et pourquoi :
--   - `tn_bracket_externe_matchs.position1/position2` NULLABLES : avant
--     qu'un tour soit joué, ses deux positions ne sont pas encore connues
--     (l'exemple, terminé, ne le montre pas).
--   - CLÉS ÉTRANGÈRES composites vers les joueurs (position1, position2,
--     vainqueur, pronostic) et des pronostics vers leur match et leur
--     participant : une position ou un userId qui ne correspond à rien est
--     une erreur de mapping, la base la refuse au lieu de la stocker.
--     `on delete cascade` depuis le tournoi seulement ; le script, lui, ne
--     supprime jamais rien.
--   - `tour` en CHECK ('ATP','WTA'), positions >= 1, points >= 0.
--   - `updated_at` = date de la DERNIÈRE SYNCHRO de la ligne (posée
--     explicitement à chaque upsert, le default ne joue qu'à l'insertion).
--     Le script s'en sert comme `updatedSince` de la synchro suivante.
--   - `tournament_id_interne` NE s'appuie PAS sur tn_tournaments.external_id :
--     cette colonne porte l'id ATP/WTA du tournoi et sert de clé d'upsert à
--     l'import (`external_id, tour, year`, app/import/actions.ts). L'id de
--     Thomas n'a rien à y faire. Le lien est posé À LA MAIN, au cas par cas :
--     NULL par défaut, aucun rapprochement automatique par nom ou date.
--
-- RLS : même régime que tn_player_insights (0021) et toutes les tables
-- tn_* — lecture publique, aucune policy d'écriture, privilèges limités à
-- SELECT ; seule la service role écrit.
--
-- Idempotent : rejouable sans risque.
-- =====================================================================

create table if not exists tn_bracket_externe_tournois (
  id                    text primary key,                 -- id de Thomas
  nom                   text not null,
  tour                  text not null check (tour in ('ATP', 'WTA')),
  annee                 integer not null,
  type                  text,                             -- ex. 'GRAND_SLAM'
  surface               text,                             -- ex. 'HARD'
  lieu                  text,
  draw_size             integer not null check (draw_size >= 2),
  statut                text,                             -- ex. 'COMPLETED'
  verrouille            boolean not null default false,
  lock_at               timestamptz,
  tournament_id_interne uuid references tn_tournaments(id) on delete set null,
  updated_at            timestamptz not null default now()
);

create table if not exists tn_bracket_externe_participants (
  tournoi_id              text not null references tn_bracket_externe_tournois(id) on delete cascade,
  user_id                 text not null,
  pseudo                  text not null,
  rempli                  boolean not null default false,
  -- Calculé par Thomas : vérification croisée seulement, jamais la référence.
  points_totaux_thomas    integer check (points_totaux_thomas >= 0),
  -- Recalculé chez nous depuis les pronostics bruts (lib/thomasApi.ts).
  points_totaux_calcule   integer check (points_totaux_calcule >= 0),
  updated_at              timestamptz not null default now(),
  primary key (tournoi_id, user_id)
);

create table if not exists tn_bracket_externe_joueurs (
  tournoi_id     text not null references tn_bracket_externe_tournois(id) on delete cascade,
  position       integer not null check (position >= 1),
  prenom         text not null,
  nom            text not null,
  tete           integer,
  statut         text,                                    -- ex. 'LL', 'Alt'
  pays           text,
  classement     integer,
  api_player_id  text,
  updated_at     timestamptz not null default now(),
  primary key (tournoi_id, position)
);

create table if not exists tn_bracket_externe_matchs (
  tournoi_id   text not null references tn_bracket_externe_tournois(id) on delete cascade,
  tour         integer not null check (tour >= 1),        -- 1 = premier tour
  match_index  integer not null check (match_index >= 0),
  position1    integer,
  position2    integer,
  vainqueur    integer,
  score        text,
  updated_at   timestamptz not null default now(),
  primary key (tournoi_id, tour, match_index),
  foreign key (tournoi_id, position1) references tn_bracket_externe_joueurs(tournoi_id, position),
  foreign key (tournoi_id, position2) references tn_bracket_externe_joueurs(tournoi_id, position),
  foreign key (tournoi_id, vainqueur) references tn_bracket_externe_joueurs(tournoi_id, position),
  check (vainqueur is null or vainqueur = position1 or vainqueur = position2)
);

create table if not exists tn_bracket_externe_pronostics (
  tournoi_id     text not null,
  tour           integer not null,
  match_index    integer not null,
  user_id        text not null,
  position       integer,                                 -- null = pas de pronostic
  -- Jugement de Thomas, stocké tel quel (on recalcule le nôtre à part).
  resultat       text not null
                 check (resultat in ('correct', 'rate', 'en_attente', 'sans_prono')),
  -- Pick antérieur à l'élimination du joueur : à exclure de tout taux de
  -- réussite « classique » (cf. statistiquesPronostics, lib/thomasApi.ts).
  joueur_absent  boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (tournoi_id, tour, match_index, user_id),
  foreign key (tournoi_id, tour, match_index)
    references tn_bracket_externe_matchs(tournoi_id, tour, match_index) on delete cascade,
  foreign key (tournoi_id, user_id)
    references tn_bracket_externe_participants(tournoi_id, user_id) on delete cascade,
  foreign key (tournoi_id, position)
    references tn_bracket_externe_joueurs(tournoi_id, position)
);

-- ---------------------------------------------------------------------
-- RLS — lecture publique, écritures réservées à la service role.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'tn_bracket_externe_tournois',
    'tn_bracket_externe_participants',
    'tn_bracket_externe_joueurs',
    'tn_bracket_externe_matchs',
    'tn_bracket_externe_pronostics'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('revoke all on table %I from anon, authenticated', t);
    execute format('grant select on table %I to anon, authenticated', t);
  end loop;
end $$;
