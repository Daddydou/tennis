-- =====================================================================
-- PICKS : UNE PHASE PAR PICK (format Masters)
--
-- Jusqu'ici un joueur ne pouvait être pické qu'UNE fois par tournoi (index uniques sur
-- (tournoi, joueur)). Dans un Masters (ATP / WTA Finals) la règle est « une fois par PHASE » :
-- trois joueurs différents par poule sur les trois journées, puis, en phase finale, on repart de
-- zéro (demie et finale). Un même joueur peut donc être pické en poules ET en demie.
--
-- `phase` vaut 'tournoi' par défaut : aucun changement pour les tournois à tableau (un joueur reste
-- pickable une seule fois). Pour un Masters : 'poules' (J1, J2, J3) ou 'finale' (SF, F).
-- Les index d'unicité par joueur incluent désormais la phase ; les index par emplacement
-- (tournoi, tour, moitié) sont inchangés.
-- =====================================================================

alter table tn_picks add column if not exists phase text not null default 'tournoi';

alter table tn_picks drop constraint if exists tn_picks_phase_check;
alter table tn_picks add constraint tn_picks_phase_check check (phase in ('tournoi', 'poules', 'finale'));

drop index if exists idx_tn_picks_moi_joueur;
drop index if exists idx_tn_picks_participant_joueur;

create unique index idx_tn_picks_moi_joueur
  on tn_picks (tournament_id, player_id, phase) where participant_id is null;
create unique index idx_tn_picks_participant_joueur
  on tn_picks (tournament_id, participant_id, player_id, phase) where participant_id is not null;
