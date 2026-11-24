-- =====================================================================
-- PRONOS DE LA COUPE DAVIS (pronos des matchs + score du bracket)
--
-- Game Tracker ne donne ces deux choses dans aucune API : elles se lisent sur son site et se collent dans
-- l'app (onglet Pronos du tournoi). Une ligne = un prono d'un participant :
--   - jeu 'match'   : le prono d'UN match d'une rencontre (ordre 1 = simple 1, 2 = simple 2, 3 = double) :
--                     nation gagnante + score en sets (2-0 ou 2-1) ;
--   - jeu 'bracket' : le prono d'UNE rencontre dans le bracket des nations (ordre null) : nation gagnante +
--                     score de la rencontre (2-0 ou 2-1). Il sert au bonus de score (+1 / +2 / +4) ; les
--                     points de la bonne nation viennent de tn_bracket_round_picks (API de Thomas).
-- La rencontre est une ligne de tn_matches : (round, match_position). Les nations sont notees par leur code
-- (ITA, KOR, CZE, CAN, GBR, GER, AUT, ESP). participant_id null = moi. Meme regime que les autres tables
-- tn_* : lecture publique, ecritures reservees a la service role.
-- =====================================================================

create table if not exists tn_davis_pronos (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references tn_tournaments(id) on delete cascade,
  participant_id   uuid references tn_participants(id) on delete cascade,
  round            text not null check (round in ('QF', 'SF', 'F')),
  match_position   integer not null check (match_position >= 0),
  jeu              text not null check (jeu in ('match', 'bracket')),
  ordre            smallint check (ordre in (1, 2, 3)),
  nation           text not null check (nation ~ '^[A-Z]{3}$'),
  sets             text not null check (sets in ('2-0', '2-1')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((jeu = 'bracket' and ordre is null) or (jeu = 'match' and ordre is not null))
);

create index if not exists idx_tn_davis_pronos_tournoi on tn_davis_pronos (tournament_id);

-- Un seul prono par participant, rencontre, jeu et match (participant null = moi : index a part).
create unique index if not exists idx_tn_davis_pronos_moi
  on tn_davis_pronos (tournament_id, round, match_position, jeu, coalesce(ordre, 0))
  where participant_id is null;
create unique index if not exists idx_tn_davis_pronos_participant
  on tn_davis_pronos (tournament_id, participant_id, round, match_position, jeu, coalesce(ordre, 0))
  where participant_id is not null;

alter table tn_davis_pronos enable row level security;

drop policy if exists tn_davis_pronos_read on tn_davis_pronos;
create policy tn_davis_pronos_read on tn_davis_pronos
  for select to anon, authenticated using (true);

revoke all on table tn_davis_pronos from anon, authenticated;
grant select on table tn_davis_pronos to anon, authenticated;
