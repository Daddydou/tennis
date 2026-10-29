# Backtest des insights joueurs

Les insights (`tn_player_insights`) affichent des **faits sourcés** (forfait, blessure, charge de matchs…) en badge sur l'écran Picks. Ils ne modifient ni les probabilités, ni le plan, ni les picks. Cette page dit comment on vérifie qu'ils apportent une information que le marché n'a pas déjà.

## Lancer le backtest

```
npm run backtest:insights                      # toutes les lignes
npm run backtest:insights -- --confiance=high  # drapeaux de confiance haute seulement
npm run backtest:insights -- --tirages=20000   # placebo plus fin
```

Lecture seule (clé anon). Le script ne regarde que les matchs **postérieurs** au jour de la recherche (`as_of`), d'après l'heure de début des cotes : aucun regard dans le futur.

## Ce qui est mesuré

Pour chaque groupe (blessure ou forfait, charge, tous les drapeaux, contexte seul), l'écart entre les victoires réelles des joueurs marqués et les victoires que **les cotes** attendaient (cotes dé-marginées, `tn_odds`). La baseline est le marché et non l'Elo : le marché connaît déjà les blessures publiques, un drapeau n'a de valeur que s'il fait mieux que lui.

Un **test placebo** recalcule le même écart pour des tirages au hasard de joueurs du même tournoi. Le pourcentage affiché est la part des tirages au hasard qui font moins bien que les joueurs marqués : proche de 50 %, rien ; ≤ 5 % ou ≥ 95 %, un effet à regarder de près.

## Résultat du 29/10/2026 (4 tournois : Singapour WTA, Beijing ATP, Tokyo ATP, Pékin WTA)

| Groupe | Joueurs | Matchs | Victoires | Attendues (marché) | Écart | Placebo |
|---|---|---|---|---|---|---|
| Blessure ou forfait | 5 | 8 | 4 | 5,65 | −1,65 (−1,4 σ) | 9 % |
| Charge | 5 | 8 | 4 | 4,51 | −0,51 (−0,4 σ) | 35 % |
| Tous les drapeaux | 10 | 16 | 8 | 10,16 | −2,16 (−1,3 σ) | 10 % |
| Contexte seul | 28 | 46 | 26 | 25,49 | +0,51 (+0,2 σ) | 58 % |

**Verdict : échantillon insuffisant, on ne conclut pas.** 16 matchs de joueurs marqués sur 3 tournois exploitables ; il en faut une trentaine par groupe et une quinzaine de tournois. La tendance (les joueurs marqués font un peu moins bien que ce que le marché attend) va dans le sens attendu mais reste dans le bruit. Aucun effet sur les probabilités tant que le backtest n'a pas conclu.

## Comment grossir l'échantillon

- Pour chaque nouveau tournoi, demander à Claude (conversation Cowork) « lance la recherche sur <tournoi> » **avant** les premiers matchs : les matchs jouables après `as_of` sont alors nombreux.
- Les cotes doivent être capturées (import par API : cotes des matchs à venir mises à jour à chaque passage).
- Relancer `npm run backtest:insights` après chaque tournoi ; le verdict change de ton tout seul quand le seuil est atteint.

## Règles pour passer d'un affichage à un effet

1. Au moins ~15 tournois et ~30 matchs par groupe.
2. Écart supérieur à ~2 écarts-types **et** confirmé par le placebo (≥ 95 % ou ≤ 5 %).
3. N'agir que sur les drapeaux de confiance `high` (`--confiance=high`).
4. Effet modeste et plafonné, jamais de joueur masqué ou désactivé à cause d'un drapeau.
