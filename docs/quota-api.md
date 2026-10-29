# Quota de l'API tennis (RapidAPI, plan gratuit)

L'import des tableaux et l'Elo maison quotidien partagent **50 requêtes par fenêtre glissante de 24 h** (plafond strict : au-delà, l'API répond 429). Le compteur ne repart pas à minuit : il se renouvelle en continu, la requête la plus ancienne « sort » de la fenêtre 24 h après avoir été faite.

## Qui consomme quoi

| Poste | Consommation | Où |
|---|---|---|
| Tableaux en mode `api` | 1 requête par tournoi et par passage ; un passage toutes les 5,5 h, le cron tourne toutes les 6 h → **4 par jour et par tournoi** | `lib/importAutoRegles.ts`, `db/importAutoFlux.ts` |
| Elo maison quotidien | ≈ 2 par jour (1 jour de résultats × ATP + WTA) ; jusqu'à 6 par passage en rattrapage | `db/eloMaison.ts`, `lib/eloMaisonSuivi.ts` |
| Bouton « Importer » (manuel) | 1 par clic | `app/import/` |
| Tournois en mode `serveur` (page WTA) | 0 (ne passe pas par l'API) | |

Garde-fous déjà en place : l'Elo laisse une **réserve de 8 requêtes** aux tableaux (1 seulement s'il a plus de 2 jours de retard) et s'arrête au premier 429 ; il reprend au passage suivant.

## Mesure du 29/10/2026

- 2 tournois en mode `api` en cours (Bâle, Vienne) → 8 requêtes de tableaux par jour, plus ≈ 2 pour l'Elo.
- Relevé réel (`npm run verify:quota-api`) : **45 restantes sur 50**, soit environ **5 consommées** sur la fenêtre de 24 h.

## Marge selon la semaine

| Situation | Tournois en mode `api` | Requêtes par jour (tableaux + Elo 2) | Reste sur 50 |
|---|---|---|---|
| Aujourd'hui | 2 | ≈ 10 | ≈ 40 |
| Semaine chargée (un Masters 1000 + un WTA 1000 + 2 ou 3 tournois de 500) | 6 | 26 | ≈ 24 |
| Pointe (8 tournois à la fois) | 8 | 34 | ≈ 16 |

Le plan gratuit suffit donc, avec de la marge pour une dizaine d'imports manuels par jour même en pointe. Un forfait supérieur n'est utile que si l'on veut plus de 11 tournois en même temps (11 × 4 + 2 = 46).

## Que faire si le quota se vide

1. `npm run verify:quota-api` : affiche le restant et l'heure de renouvellement (consomme 1 requête).
2. Éviter les imports manuels jusqu'au renouvellement : le cron reprend seul.
3. Si ce n'est pas ponctuel : allonger `INTERVALLE_DU_API_MS` (`lib/importAutoRegles.ts`, 5,5 h → 11,5 h ramène à 2 par jour et par tournoi) ou n'activer le mode `api` que pour les tournois suivis de près.
