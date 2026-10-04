@AGENTS.md



\# Tennis App



Jeu de picks ATP/WTA + fantasy + simulateur de bracket, mono-utilisateur.

Next.js 16, Supabase (RLS), Tailwind 4, Vitest. Le projet le plus abouti

de tous les miens : sécurité et tests exemplaires, c'est le modèle à suivre

pour les autres.



\## Commandes



\- npm run dev

\- npm run test:components

\- npm run test:bracketsim (et les autres test:\*)

\- npm run verify:rls



\## Où est quoi



\- lib/ : moteur pur (scoring, elo, montecarlo, optimizer, bracketSim) — ne dépend ni de Next ni de Supabase, testable seul

\- db/\*.ts : requêtes vers la base (supabase/ ne contient plus que migrations/, attendu par la CLI Supabase)

\- supabase/migrations/ : SQL, 20 migrations à ce jour (voir MIGRATIONS.md)

\- auth/ : mot de passe unique + cookie signé (session.ts, garde.ts)

\- app/tournoi/\[id]/simulateur/ : simulateur de bracket (Monte Carlo, scénarios de victoire)



\## Règles



\- Toute écriture passe par supabaseAdmin() après sessionValide(), dans chaque Server Action.

\- Jamais de clé secrète préfixée NEXT\_PUBLIC\_.

\- Nouvelle migration = nouveau fichier numéroté + une ligne ajoutée dans MIGRATIONS.md.

\- Le barème du jeu est dans lib/scoring.ts, déjà validé : ne pas le réimplémenter ailleurs (voir README « Où corriger le barème »).

\- lib/ est LA référence : c'est tennis-picks (autre dossier) qui en a une copie dépassée, pas l'inverse.



\## Sécurité (ne pas affaiblir)



\- Auth : mot de passe unique (APP\_PASSWORD), aucun compte. Le cookie tn\_session ne contient qu'une date d'expiration signée HMAC-SHA256 (auth/session.ts) : rien en base, comparaison en temps constant.

\- proxy.ts ne fait que rediriger vers /login : ce n'est PAS la protection. Chaque Server Action et chaque route app/api/\*\* revérifie la session elle-même (sessionValide() / exigerSession() de auth/garde.ts). Seules exceptions : /api/agent/\* accepte aussi un Bearer AGENT\_API\_TOKEN, et GET /api/verif/<controle> n'accepte QUE l'en-tête x-verif-token (voir « Vérifier la prod »).

\- RLS : toutes les tables sont en lecture publique (policy select pour anon) et sans aucune policy d'écriture ; les écritures passent uniquement par la service role, côté serveur (db/server.ts, protégé par import 'server-only').

\- Nouvelle table = RLS activée + policy de lecture + revoke/grant select dans la migration, ET ajout dans la liste TABLES de scripts/verifier-rls.mjs (npm run verify:rls doit afficher « Tout est conforme »).

\- Garde-fou NEXT\_PUBLIC\_ : supabaseAdmin() refuse de démarrer si NEXT\_PUBLIC\_SUPABASE\_SERVICE\_ROLE\_KEY existe (clé qui serait inlinée dans le bundle navigateur). Ne pas retirer ce test.



## Vérifier la prod (point de contrôle /api/verif)

GET /api/verif/<controle> permet de vérifier la prod SANS cookie de session ni AUTH_SECRET.
Code : app/api/verif/[controle]/route.ts (porte), db/verif.ts (contrôles), auth/session.ts (verifierJetonVerif).

- Contrôles disponibles (liste FIXE) :
  - `sante` : dernières dates de calcul (matchs, projections, fantasy, historique) des tournois en cours. Aucune donnée personnelle.
  - `fantasy-equipe?tournoi=<uuid>` : équipe stockée dans tn_fantasy_historique contre équipe affichée (equipeEvalueeFigee), booléen `identique` + `ecarts`.
- Accès : en-tête `x-verif-token` = VERIF_TOKEN (32 caractères minimum). VERIF_TOKEN absent, jeton faux ou contrôle inconnu : 404 côté route, 401 côté proxy (comme toute route /api sans session). Seul GET passe.
- Le jeton est créé par l'utilisateur (Vercel « sensitive » + .env.local). Claude ne le génère pas, ne l'affiche pas, ne le journalise pas.

Procédure (bash), le jeton ne passe jamais ni à l'écran, ni dans l'historique, ni dans les arguments de processus :

```bash
VERIF_TOKEN="$(grep '^VERIF_TOKEN=' .env.local | cut -d= -f2-)"
printf 'x-verif-token: %s\n' "$VERIF_TOKEN" | curl -sS -H @- "https://tennis-nine-zeta.vercel.app/api/verif/sante"
printf 'x-verif-token: %s\n' "$VERIF_TOKEN" | curl -sS -H @- "https://tennis-nine-zeta.vercel.app/api/verif/fantasy-equipe?tournoi=<uuid>"
unset VERIF_TOKEN
```

(`printf` est une commande interne du shell et `-H @-` lit l'en-tête sur l'entrée standard : la valeur n'apparaît jamais dans la ligne de commande. Ne jamais utiliser `curl -v`, qui afficherait les en-têtes envoyés.)

Règles :

- LECTURE SEULE UNIQUEMENT. db/verif.ts n'importe que supabaseAnon() (RLS = select) ; jamais supabaseAdmin(), jamais getFantasy/getProjections (qui recalculent et écrivent sur cache froid). Un test vérifie qu'aucun contrôle n'appelle supabaseAdmin().
- Pas de requête générique : un nouveau contrôle = une fonction nommée ajoutée à CONTROLES dans db/verif.ts, qui renvoie un résumé (jamais de lignes brutes, jamais de clé ni de secret), + son test.
- L'allowlist du proxy ne couvre que `GET /api/verif/<un segment>` avec jeton valide. Ne pas l'élargir.

Faire tourner le jeton (en cas de doute, ou régulièrement) :

1. L'utilisateur génère une nouvelle valeur lui-même (ex. `openssl rand -base64 32`), sans la coller dans une conversation.
2. Vercel : Settings > Environment Variables > VERIF_TOKEN > Edit (type sensitive), puis redéployer (les variables ne s'appliquent qu'aux nouveaux déploiements).
3. Remplacer la valeur dans .env.local.
4. Contrôle : `sante` doit répondre 200 avec le nouveau jeton, 401/404 avec l'ancien.

Pour couper l'accès d'urgence : supprimer VERIF_TOKEN dans Vercel et redéployer (la route répond alors 404 à tout).



\## Je suis débutant



\- Réponds-moi toujours en français.

\- Explique simplement ce que tu fais et pourquoi.

\- Demande avant toute suppression de fichier ou migration.

