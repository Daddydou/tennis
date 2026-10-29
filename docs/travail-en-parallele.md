# Travailler à plusieurs sessions Claude sans se marcher dessus

Deux sessions Claude Code (ou une session et toi) peuvent travailler en même temps sur le projet. Pour éviter qu'une session commite le travail inachevé d'une autre, ou que deux branches modifient les mêmes fichiers, on suit quatre règles.

## 1. Un dossier de travail (worktree) par session

Le dossier principal `Projets\tennis` reste sur `main`, à jour, **sans rien y développer**. Chaque session crée son propre dossier :

```
cd C:\Users\lolor\Projets\tennis
git fetch origin
git worktree add ..\tennis-<sujet> -b <branche> origin/main
cmd /c mklink /J ..\tennis-<sujet>\node_modules node_modules
```

La jonction `node_modules` évite de réinstaller les paquets. Le fichier `.env.local` n'est pas copié : pour un script qui en a besoin, passer `--env-file=C:\Users\lolor\Projets\tennis\.env.local`.

## 2. Une branche par sujet, partie de `origin/main`

Pas de branche empilée sur une autre sauf nécessité (le sujet B a besoin du code du sujet A). Une PR ne mélange pas deux sujets. Les branches indépendantes se fusionnent dans n'importe quel ordre.

## 3. Une PR fusionnée à la fois

Fusionner, laisser Vercel déployer, vérifier, puis passer à la suivante. Avant d'ouvrir plusieurs PR, les fusionner **ensemble** dans une branche jetable et lancer les contrôles :

```
git switch -c integration-jetable origin/main
git merge --no-ff --no-edit <branche1> <branche2> ...   # une par une
npx tsc --noEmit ; npm run lint ; npm test
git switch <autre-branche> ; git branch -D integration-jetable
```

Les fichiers où deux branches se touchent le plus souvent : `package.json` (placer chaque nouveau script à un endroit différent), `PlanPicks.tsx`, `page.tsx` de l'écran Picks, `MIGRATIONS.md`, `docs/`.

## 4. Ne jamais commiter à l'aveugle

`git status` avant tout `git add`. On ajoute les fichiers **par nom** (jamais `git add .` ni `git add -A` dans le dossier principal) : un fichier modifié ou non suivi que la session n'a pas créé appartient à quelqu'un d'autre (`tsconfig.json`, `.claude/`, `.github/agents/`… sont dans ce cas aujourd'hui).

## Retirer un dossier de travail (une fois la branche fusionnée)

```
cmd /c rmdir ..\tennis-<sujet>\node_modules      # AVANT : retire la jonction, pas le vrai node_modules
git worktree remove ..\tennis-<sujet>
git branch -d <branche>                           # -D si la PR a été fusionnée par « squash »
git worktree prune
```

Ne jamais supprimer le dossier à la main ni avec `Remove-Item -Recurse` tant que la jonction existe : cela viderait le vrai `node_modules` du projet principal.

## Pièges de l'environnement (PC Windows)

- `NODE_ENV=production` est défini globalement : `vitest` le corrige tout seul depuis `vitest.config.mts` ; pour installer les dépendances de dev, `npm ci --include=dev`.
- Les chemins avec `[id]` demandent `-LiteralPath` dans PowerShell.
- Un script PowerShell enregistré en UTF-8 sans BOM est lu en mojibake par PowerShell 5 : ajouter le BOM, ou passer par un script Node.
- Une commande de plus de 60 s expire côté outil Desktop Commander mais peut finir : la lancer en arrière-plan avec la sortie dans un fichier (`C:\Users\lolor\Projets\_donnees\`), puis relire ; ne jamais la relancer à l'aveugle.
- Les messages de commit et corps de PR longs passent par un fichier (`git commit -F`, `gh pr create --body-file`).
