# Import automatique des tableaux

Après le **premier import manuel** d'un tournoi (écran `/import`, comme
aujourd'hui), le tournoi est « surveillé » : il est réimporté toutes les ~12 h
jusqu'à ce que la finale soit importée. Rien d'autre ne change pour l'import
manuel.

La synchro du bracket de Thomas (`npm run sync:bracket-thomas`) reste
**manuelle** : l'import automatique ne la déclenche jamais.

## Qui fait quoi

| Circuit | Mode par défaut | Qui récupère la page draws | Quand |
|---|---|---|---|
| WTA | `serveur` | Vercel, appelé par le workflow GitHub `import-auto.yml` | 06:00 et 18:00 UTC |
| ATP | `navigateur` | Le userscript Tampermonkey, dans ton navigateur | toutes les 30 min sur un onglet atptour.com ouvert, si le tournoi est dû |

- atptour.com répond **403 Cloudflare** aux requêtes serveur : seul ton
  navigateur (qui a le cookie Cloudflare) peut lire la page. D'où le userscript.
- wtatennis.com renvoie le tableau complet côté serveur. Si un jour la page
  devient inaccessible depuis Vercel, passer le tournoi en mode `navigateur`
  (voir plus bas) : le userscript s'en charge alors aussi.

Un tournoi est **dû** s'il est actif et que son dernier import réussi date de
plus de 11 h 30 (ou s'il n'a jamais été importé automatiquement). Après un
échec automatique, pas de nouvel essai pendant 1 h.

Un tableau **inchangé** (même empreinte que le dernier import) n'est ni
réimporté ni recalculé : le passage est seulement journalisé « inchangé ».

## Arrêt de la surveillance

Évalué après chaque import et au début de chaque passage du cron :

1. le match de finale (`round = 'F'`) a un vainqueur en base → `finale_importee` ;
2. le tournoi est `completed`, ou sa date de fin + 2 jours est dépassée → `fin_tournoi` ;
3. 21 jours après le premier import → `plafond_21j` ;
4. bouton « Arrêter la surveillance » dans `/import` → `manuel`.

« Reprendre » (même écran) relance la surveillance et remet le compteur des
21 jours à zéro. Un tournoi dont la finale est déjà en base sera recoupé au
passage suivant.

## Voir ce qui se passe

`/import` (connecté), section **Imports automatiques** : mode, dernier succès,
prochain passage prévu, échecs consécutifs, dernière erreur, motif d'arrêt et
10 derniers passages. Un **bandeau rouge** apparaît dès 2 échecs consécutifs
sur un tournoi actif.

Côté WTA, le workflow GitHub **échoue** dès qu'un tournoi est en erreur :
GitHub t'envoie alors un e-mail (alerte gratuite).

## Installer le userscript (ATP)

1. Installer l'extension **Tampermonkey** dans Chrome
   (Chrome Web Store → « Tampermonkey »). Dans `chrome://extensions`, activer
   le **mode développeur** (Chrome l'exige pour les userscripts récents), puis
   dans les détails de Tampermonkey, autoriser l'accès aux sites.
2. Tableau de bord Tampermonkey → **Utilitaires** → *Importer depuis un
   fichier* → choisir `tools/userscript/import-auto.user.js`
   (ou créer un nouveau script et coller le contenu du fichier).
3. Ouvrir une page `https://www.atptour.com/…`. Au premier passage, le script
   demande le **jeton** : coller la valeur de `IMPORT_AUTO_TOKEN` (la même que
   sur Vercel). Il est rangé dans le stockage de Tampermonkey, jamais dans le
   fichier. Si tu annules, il ne redemande pas avant 24 h.
4. Tampermonkey demande ensuite l'autorisation de joindre
   `tennis-nine-zeta.vercel.app` : choisir **Toujours autoriser le domaine**.

Un petit badge en bas à gauche de la page indique le dernier résultat
(vert = OK, rouge = erreur). Il ne bloque rien (transparent aux clics).

Le fichier `.user.js` est **généré** : après toute modification de
`lib/extract/` ou `tools/userscript/src/`, lancer `npm run build:userscript`
(un test échoue sinon).

**Jeton refusé** : le serveur répond de la même façon (401/404) à un jeton
faux, à une variable `IMPORT_AUTO_TOKEN` absente et à des routes pas encore
déployées en production. Le badge affiche alors « refusé » ; après **3 refus
d'affilée** (~1 h 30), le script oublie le jeton et le redemande. Pour forcer :
Tampermonkey → le script → onglet *Stockage* → vider `importAuto.jeton`.

Le script n'envoie **jamais** les cookies de l'app (requêtes anonymes) : seul
le jeton ouvre l'accès, même si tu es connecté à l'app dans le même navigateur.

### Limite honnête

Le userscript ne tourne que si **le navigateur est ouvert sur atptour.com**
(n'importe quelle page du site). S'il n'y a aucun onglet ouvert, rien ne se
passe : le tournoi reste « dû » et sera traité à la prochaine visite.

Suggestion : une tâche planifiée Windows qui ouvre la page draws deux fois par
jour. Planificateur de tâches → *Créer une tâche de base* → quotidienne, à
8 h 00 (puis une seconde à 20 h 00) → *Démarrer un programme* :

- Programme : `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Arguments : `https://www.atptour.com/en/scores/current/<slug>/<id>/draws`

Le script se déclenche 5 s après le chargement de la page.

## Passer un tournoi WTA en mode navigateur

Si le cron échoue durablement (403, page vide depuis Vercel), basculer le
tournoi dans l'éditeur SQL Supabase :

```sql
update tn_import_auto set mode = 'navigateur' where tournament_id = '<uuid>';
```

Le userscript (sur un onglet wtatennis.com) le prendra alors en charge.

## API (jeton `x-import-token`)

Toutes répondent **404** sans jeton valide (ou si `IMPORT_AUTO_TOKEN` n'est
pas défini). Le proxy n'ouvre que ces trois couples exacts.

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/import-auto/etat` | tournois actifs : `tournament_id, tour, source_url, mode, du, dernier_succes_at` |
| POST | `/api/import-auto/ingest` | `{json, tournament_id?}` : importe une extraction ; `{tournament_id, echec}` : journalise un échec du userscript |
| POST | `/api/import-auto/run` | passage du cron ; `?dry=1` = à blanc, zéro écriture ; `?dry=1&source_url=<page wtatennis.com>` = diagnostic d'une page précise |

Test à blanc depuis un terminal bash (le jeton ne s'affiche jamais) :

```bash
IMPORT_AUTO_TOKEN="$(grep '^IMPORT_AUTO_TOKEN=' .env.local | cut -d= -f2-)"
printf 'x-import-token: %s\n' "$IMPORT_AUTO_TOKEN" | curl -sS -X POST -H @- \
  "https://tennis-nine-zeta.vercel.app/api/import-auto/run?dry=1"
unset IMPORT_AUTO_TOKEN
```

## Faire tourner le jeton

1. Générer une nouvelle valeur soi-même (ex. `openssl rand -base64 32`), sans
   la coller dans une conversation.
2. Vercel : *Settings > Environment Variables > IMPORT_AUTO_TOKEN > Edit*
   (type *sensitive*), puis **redéployer**.
3. GitHub : *Settings > Secrets and variables > Actions > IMPORT_AUTO_TOKEN*.
4. `.env.local` si tu l'y as mise.
5. Le userscript redemandera le jeton tout seul (l'ancien est refusé).

Coupure d'urgence : supprimer `IMPORT_AUTO_TOKEN` sur Vercel et redéployer —
toutes les routes répondent alors 404.
