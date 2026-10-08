-- =====================================================================
-- BRACKET EXTERNE — exemptions (BYE) dans tn_bracket_externe_joueurs
--
-- Un tableau à 96 (Shanghai 2026) a 32 exemptions. L'API de Thomas les
-- renvoie comme des joueurs : { statut: 'BYE', prenom: null, nom: null, … }.
-- Elles doivent être stockées (les matchs du tour 1 y renvoient par clé
-- étrangère), mais prenom/nom étaient NOT NULL.
--
-- Invariant gardé EN BASE, pas seulement dans lib/thomasApi.ts : prénom et
-- nom ne peuvent manquer QUE sur une exemption. Une écriture qui contourne
-- l'app (script ponctuel, correction SQL) est refusée pareil.
--
-- `is not distinct from` et non `=` : pour un joueur normal, statut est
-- NULL ; `statut = 'BYE'` vaudrait NULL, `NULL or false` aussi, et un CHECK
-- qui vaut NULL PASSE. Avec `=`, un joueur normal sans nom serait accepté.
--
-- Aucune nouvelle table : RLS et droits inchangés (0022).
-- Rejouable : la contrainte est retirée avant d'être (re)posée.
-- =====================================================================

alter table tn_bracket_externe_joueurs drop constraint if exists tn_bracket_externe_joueurs_nom_sauf_bye;

alter table tn_bracket_externe_joueurs
  alter column prenom drop not null,
  alter column nom drop not null,
  add constraint tn_bracket_externe_joueurs_nom_sauf_bye
    check (statut is not distinct from 'BYE' or (prenom is not null and nom is not null));
