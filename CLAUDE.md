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

\- proxy.ts ne fait que rediriger vers /login : ce n'est PAS la protection. Chaque Server Action et chaque route app/api/\*\* revérifie la session elle-même (sessionValide() / exigerSession() de auth/garde.ts). Seule exception : /api/agent/\* accepte aussi un Bearer AGENT\_API\_TOKEN.

\- RLS : toutes les tables sont en lecture publique (policy select pour anon) et sans aucune policy d'écriture ; les écritures passent uniquement par la service role, côté serveur (db/server.ts, protégé par import 'server-only').

\- Nouvelle table = RLS activée + policy de lecture + revoke/grant select dans la migration, ET ajout dans la liste TABLES de scripts/verifier-rls.mjs (npm run verify:rls doit afficher « Tout est conforme »).

\- Garde-fou NEXT\_PUBLIC\_ : supabaseAdmin() refuse de démarrer si NEXT\_PUBLIC\_SUPABASE\_SERVICE\_ROLE\_KEY existe (clé qui serait inlinée dans le bundle navigateur). Ne pas retirer ce test.



\## Je suis débutant



\- Réponds-moi toujours en français.

\- Explique simplement ce que tu fais et pourquoi.

\- Demande avant toute suppression de fichier ou migration.

