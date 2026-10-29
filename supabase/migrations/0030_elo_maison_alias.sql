-- =====================================================================
-- ELO MAISON — ALIAS D'IDENTITÉ
--
-- tn_elo_maison_alias : pour un joueur de l'app (tn_players.id), la ligne de
-- tn_elo_maison (ta_slug) qui est SA ligne. Elle passe avant le rapprochement
-- par le nom (lib/eloMaisonAlias.ts, db/elo.ts).
--
-- Pourquoi : l'archive écrit parfois un même joueur de plusieurs façons
-- (« Xin Yu Wang » / « Xinyu Wang », « Ye Xin Ma » / « Yexin Ma »...), et le
-- passage quotidien a pu recréer une ligne neuve (WTA:m47152, 19 matchs, repartie
-- de 1500) à côté de la ligne historique (WTA:s216133, 444 matchs). Le rapprochement
-- par le nom voit alors des homonymes « ambigus » et retombe sur le défaut du circuit.
--
-- NON DESTRUCTIF : aucune ligne de tn_elo_maison n'est supprimée ni fusionnée.
-- Même régime que les autres tables tn_* : lecture publique, écritures réservées
-- à la service role (ajout à la main : voir docs/elo-maison.md).
-- =====================================================================

create table if not exists tn_elo_maison_alias (
  player_id  text primary key references tn_players(id) on delete cascade,
  tour       text not null check (tour in ('atp','wta')),
  ta_slug    text not null,
  note       text,
  created_at timestamptz default now()
);

create index if not exists idx_tn_elo_maison_alias_slug on tn_elo_maison_alias (tour, ta_slug);

alter table tn_elo_maison_alias enable row level security;

drop policy if exists tn_elo_maison_alias_read on tn_elo_maison_alias;
create policy tn_elo_maison_alias_read on tn_elo_maison_alias
  for select to anon, authenticated using (true);

revoke all on table tn_elo_maison_alias from anon, authenticated;
grant select on table tn_elo_maison_alias to anon, authenticated;

-- Amorçage : les cas relevés le 29/10/2026 par `npm run verify:elo-inconnus`
-- (deux « X. Wang » et un « Y. Ma » chinois, ambigus dans les tournois WTA de septembre-octobre).
-- Chaque alias n'est posé que si le joueur ET la ligne d'Elo existent.
insert into tn_elo_maison_alias (player_id, tour, ta_slug, note)
select v.player_id, v.tour, v.ta_slug, v.note
from (values
  ('326160', 'wta', 'WTA:s216016', 'Xiyu Wang — lien Matchstat 43872 (ligne mise à jour chaque jour)'),
  ('326376', 'wta', 'WTA:s216133', 'Xinyu Wang — ligne historique (444 matchs) ; WTA:m47152 est le même joueur, repartie de 1500'),
  ('322417', 'wta', 'WTA:s215946', 'Yexin Ma — ligne historique (498 matchs) ; WTA:m29825 est le même joueur')
) as v(player_id, tour, ta_slug, note)
where exists (select 1 from tn_players p where p.id = v.player_id)
  and exists (select 1 from tn_elo_maison m where m.ta_slug = v.ta_slug and m.tour = v.tour)
on conflict (player_id) do nothing;
