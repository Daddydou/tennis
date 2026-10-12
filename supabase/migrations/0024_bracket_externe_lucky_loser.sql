-- =====================================================================
-- BRACKET EXTERNE — lucky loser pas encore désignée
--
-- Wuhan WTA 2026 : l'API de Thomas renvoie la position 12 comme
-- { statut: 'LL', prenom: null, nom: null, … } tant que la lucky loser
-- n'est pas connue. La 0023 n'autorisait un nom manquant que pour
-- statut = 'BYE' : l'upsert de cette ligne serait refusé.
--
-- Invariant élargi, toujours gardé EN BASE : prénom et nom ne peuvent
-- manquer QUE sur une exemption (BYE) ou une lucky loser (LL). Tout autre
-- joueur sans nom reste refusé, même écrit hors de l'app.
--
-- `is not distinct from` et non `=` : pour un joueur normal, statut est
-- NULL ; `statut = 'LL'` vaudrait NULL, et un CHECK qui vaut NULL PASSE
-- (cf. 0023).
--
-- Aucune nouvelle table : RLS et droits inchangés (0022).
-- Rejouable : la contrainte est retirée avant d'être (re)posée.
-- =====================================================================

alter table tn_bracket_externe_joueurs drop constraint if exists tn_bracket_externe_joueurs_nom_sauf_bye;

alter table tn_bracket_externe_joueurs
  add constraint tn_bracket_externe_joueurs_nom_sauf_bye
    check (
      statut is not distinct from 'BYE'
      or statut is not distinct from 'LL'
      or (prenom is not null and nom is not null)
    );
