# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Un seul utilisateur : le propriétaire de l'app, connecté par mot de passe unique (aucun compte). Il l'utilise autant sur mobile, pour suivre un tournoi en direct et poser ses picks en déplacement, que sur ordinateur, pour préparer ses choix et analyser.

Laki et Thomas (pseudo « moustiton » chez Game Tracker) sont des participants suivis dans les jeux : leurs picks et pronostics sont importés et comparés, mais ils ne se connectent pas à l'app.

## Product Purpose

Jeu de picks tennis ATP/WTA personnel, avec deux rôles d'importance égale :

- **Décider** : aider à faire les meilleurs choix face à Laki et Thomas (Elo par surface, Elo maison, cotes, simulation Monte Carlo, optimiseur d'affectation, scénarios de victoire).
- **Suivre** : tenir les comptes des trois jeux (Picks, Fantasy, Bracket), les classements, l'historique et le bilan de saison.

Réussir, c'est prendre une bonne décision vite au moment où un tour ouvre, et savoir à tout moment où on en est par rapport aux autres.

## Positioning

Un outil de joueur, pas un site de tennis : il connaît les règles exactes des jeux auxquels on joue (barème validé dans lib/scoring.ts, un joueur une seule fois par tournoi et par participant, règles datées comme le forfait à 10 pts) et transforme les données brutes en recommandation pour ces jeux-là, contre ces adversaires-là.

## Operating Context

- Rythme des tournois : à chaque tour, on pique des joueurs (12 picks par tournoi : 2 par tour jusqu'aux quarts, puis 1 en demi et 1 en finale). Le tour ouvert est le moment critique.
- Trois jeux par tournoi : Picks, Fantasy, Bracket (simulateur de tableau). Écrans du tournoi : dashboard, tableau, prédictions, picks, fantasy, bracket, simulateur, résultats.
- Sources externes : import des tableaux (API Matchstat, cron WTA, userscript ATP), Elo (Tennis Abstract ou Elo maison), API bracket de Thomas, Game Tracker (lecture, et envoi manuel de mes picks du tour ouvert).
- Écrans transverses : bilan de saison, calibration, face-à-face, participants, import, procédures (mode d'emploi de tous les gestes).

## Capabilities and Constraints

- Next.js 16 (App Router), Supabase (RLS), Tailwind 4, déployé sur Vercel (région dub1).
- Toute l'interface est en français.
- Sécurité non négociable (voir CLAUDE.md) : mot de passe unique, chaque Server Action revérifie la session, aucune écriture hors service role.
- Les calculs lourds (Monte Carlo) ne doivent jamais bloquer l'affichage : les écrans lents doivent rester rapides.
- Quota API tennis limité (50 requêtes / 24 h) : l'interface ne déclenche jamais d'appel externe à l'affichage, seulement sur bouton manuel.
- Envoi vers Game Tracker : uniquement par bouton manuel, jamais automatique.

## Brand Commitments

- Le système de design existant est la base à conserver : thème clair esprit Apple, jetons partagés dans app/ui.tsx, accent bleu système (détail dans DESIGN.md). Pas de rebranding.

## Evidence on Hand

- Données réelles de tournois en base (Supabase) et sauvegardes JSON à la racine (ex. madrid2026.json).
- Aucune donnée inventée : pas de faux scores, faux joueurs ni fausses statistiques dans l'interface.

## Product Principles

1. **La décision d'abord** : au tour ouvert, l'information qui aide à choisir doit être visible sans chercher.
2. **Les chiffres sont la vérité** : le barème et les règles viennent du moteur (lib/), l'interface ne les réinterprète pas.
3. **Rien d'automatique qui écrit** : les gestes qui modifient une donnée externe ou consomment du quota restent manuels et explicites.
4. **Mobile et ordinateur à égalité** : chaque écran doit fonctionner pleinement sur les deux.
5. **Mesurer sans ajuster en silence** : on montre les chiffres de calibration, on ne modifie pas le moteur dans l'ombre.

## Accessibility & Inclusion

- Lisible en extérieur, en plein soleil, sur téléphone : contraste fort, texte assez grand, cibles tactiles confortables.
