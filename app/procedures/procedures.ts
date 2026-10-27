/**
 * Contenu de l'onglet « Procédures » - LE fichier à modifier quand un geste
 * change ou qu'on en crée un nouveau (la page `page.tsx` ne fait que l'afficher).
 *
 * Règles d'écriture :
 * - court et concret : des étapes qu'on peut suivre sans réfléchir ;
 * - entre `accents graves`, un nom de fichier, de bouton ou de commande ;
 * - JAMAIS une valeur secrète (clé, jeton, mot de passe) : seulement le NOM de
 *   la variable. Un test (`__tests__/procedures.test.ts`) refuse les formes les
 *   plus courantes de clés collées par erreur ;
 * - `maj` = date du dernier changement de la procédure (AAAA-MM-JJ) ;
 * - `doc` = où trouver le détail complet quand il existe.
 */

export type Procedure = {
  /** Identifiant stable, sert de lien (`/procedures#id`). Lettres, chiffres, tirets. */
  id: string;
  titre: string;
  /** Une phrase : à quoi ça sert. */
  resume: string;
  /** Quand la faire. */
  quand: string;
  etapes: string[];
  /** Pièges à connaître (optionnel). */
  attention?: string[];
  /** Détail complet ailleurs (optionnel). */
  doc?: string;
  maj: string;
};

export type Groupe = {
  id: string;
  titre: string;
  procedures: Procedure[];
};

export const GROUPES: Groupe[] = [
  {
    id: 'semaine',
    titre: 'Chaque semaine',
    procedures: [
      {
        id: 'importer-tournoi',
        titre: 'Importer le tableau d’un tournoi',
        resume: 'Charger un nouveau tournoi ATP ou WTA dans l’app.',
        quand: 'Dès que le tirage au sort est publié.',
        etapes: [
          'Ouvrir `Importer` et regarder la section `Tournois de la semaine`.',
          'Appuyer sur `Importer le tableau` en face du tournoi (1 requête API).',
          'Le tournoi est alors surveillé : l’app le remet à jour toute seule toutes les 6 h jusqu’à la finale.',
          'Vérifier dans `Tournois` que le tableau s’affiche et que les cotes sont là.',
        ],
        attention: [
          'Quota de l’API : 50 requêtes par jour, partagées avec l’Elo maison. Éviter de multiplier `Mettre à jour maintenant`.',
          'Un tournoi déjà importé avec le bookmarklet n’est pas réimporté depuis l’API (volontaire).',
        ],
        doc: 'docs/import-auto.md',
        maj: '2026-10-23',
      },
      {
        id: 'poser-picks',
        titre: 'Poser ses picks',
        resume: 'Choisir ses joueurs pour le tour ouvert.',
        quand: 'À chaque tour, avant le premier match du tour.',
        etapes: [
          'Ouvrir le tournoi puis `Picks`, vue `Moi` (l’ancien onglet `Plan` est devenu cet écran).',
          'Choisir une façon de jouer (`Prudent`, `Équilibré`, `Audacieux` ou `Contre Laki et Thomas`) : le plan propose un joueur pour chaque pick restant du tournoi.',
          'Garder la proposition ou en choisir une autre (`plan B`, ou une case du grand tableau) : le reste du plan s’adapte.',
          'Appuyer sur `Valider` (ou `Valider les 2 picks du tour`).',
        ],
        attention: [
          'Seul le tour dont les joueurs sont connus se valide. Avant, l’écran dit « validation à la fin du R32 » : on peut déjà `Réserver` : la réservation est gardée par l’app sur tous les appareils, mais ce n’est pas un pick (rien n’est compté ni envoyé).',
          'Un joueur ne se pique qu’une fois par tournoi PAR participant : Moi, Laki et Thomas peuvent prendre le même joueur.',
          'Vérifier pour qui on pique : un bandeau orange s’affiche quand on modifie les picks de Laki ou de Thomas.',
          '`Retirer` un pick validé demande une confirmation (`Oui, retirer`).',
          'En demi-finale et en finale : un seul pick.',
        ],
        doc: 'README.md (principe du jeu)',
        maj: '2026-10-27',
      },
      {
        id: 'envoyer-game-tracker',
        titre: 'Envoyer ses picks sur Game Tracker',
        resume: 'Poser chez Thomas les picks déjà choisis dans l’app.',
        quand: 'Après avoir validé ses picks, avant le verrouillage du tour.',
        etapes: [
          'Écran `Picks` du tournoi, panneau `Game Tracker`.',
          'Appuyer sur `Lire Game Tracker` : on voit le tour ouvert, l’heure de verrou, le pick actuel et ce qui serait envoyé.',
          'Si le tournoi n’est pas encore relié, choisir le bon tournoi dans la liste puis `Relier` (une seule fois par tournoi).',
          'Appuyer sur `Envoyer sur Game Tracker`.',
          'Relire le résultat affiché : l’app relit le pick réel et signale tout écart.',
          'À chaque lecture, les tours déjà verrouillés chez Game Tracker sont recopiés chez nous pour Moi, Laki et Thomas : c’est leur jeu qui compte. Le panneau liste les changements.',
        ],
        attention: [
          'Rien ne part tout seul : seul le bouton envoie.',
          'Rien à piquer pour le tour ouvert ? Notre tableau n’a sans doute pas encore les résultats du tour précédent : mettre le tableau à jour (`Importer`), puis relire.',
          'Game Tracker peut rediriger un pick si un joueur « en attente » perd : relire juste avant le verrou.',
          'Le POST remplace le pick du tour en entier (un côté non posé reste tel que chez eux).',
          'La clé est `GAMETRACKER_PICKS_KEY` (Vercel, type sensitive). Elle est donnée par l’admin de Game Tracker, jamais collée dans une conversation.',
        ],
        doc: 'docs/game-tracker-picks.md',
        maj: '2026-10-24',
      },
      {
        id: 'fantasy',
        titre: 'Composer l’équipe Fantasy',
        resume: 'Choisir une équipe, une seule fois, avant le début du tournoi.',
        quand: 'Après le tirage, avant le premier match.',
        etapes: [
          'Ouvrir le tournoi puis `Fantasy`.',
          'Composer l’équipe : un joueur par palier de classement (5 en Grand Chelem, 4 ailleurs). L’écran propose la composition optimale.',
          'Valider : l’équipe est ensuite figée.',
          'Pendant le tournoi, l’écran montre le score réel de l’équipe figée.',
        ],
        attention: [
          'Le Fantasy et les picks sont deux jeux séparés, sans effet l’un sur l’autre.',
          'L’historique `Fantasy` se remplit à chaque import ; `Reprendre les tournois déjà en base` rattrape les anciens (à recliquer tant qu’il en reste).',
        ],
        doc: 'README.md (écrans)',
        maj: '2026-10-23',
      },
    ],
  },
  {
    id: 'donnees',
    titre: 'Données et Elo',
    procedures: [
      {
        id: 'import-manuel',
        titre: 'Importer à la main (secours)',
        resume: 'Charger un tableau par collage quand l’API ne le fournit pas.',
        quand: 'Si un tournoi n’apparaît pas dans `Tournois de la semaine`, ou si l’API est en panne.',
        etapes: [
          'Ouvrir la page du tableau sur le site ATP ou WTA, lancer le bookmarklet et copier le JSON obtenu.',
          'Ouvrir `Importer`, coller le JSON, valider.',
          'Le tournoi est ensuite surveillé automatiquement (toutes les ~12 h).',
        ],
        attention: [
          'ATP : le site refuse les requêtes serveur (403) ; seul le navigateur peut lire la page, d’où le userscript Tampermonkey.',
        ],
        doc: 'docs/import-auto.md',
        maj: '2026-10-23',
      },
      {
        id: 'surveillance',
        titre: 'Voir, arrêter ou reprendre la surveillance d’un tournoi',
        resume: 'Contrôler les imports automatiques.',
        quand: 'Si un tournoi ne se met plus à jour, ou pour couper un tournoi fini.',
        etapes: [
          'Ouvrir `Importer`, section `Imports automatiques` : mode, dernier succès, prochain passage, erreurs, 10 derniers passages.',
          'Bandeau rouge = au moins 2 échecs de suite sur un tournoi actif : lire la dernière erreur affichée.',
          '`Arrêter la surveillance` coupe un tournoi ; `Reprendre` la relance (compteur de 21 jours remis à zéro).',
        ],
        attention: [
          'La surveillance s’arrête seule quand la finale est importée, 2 jours après la fin du tournoi, ou après 21 jours.',
          'Un e-mail de GitHub arrive si le passage automatique échoue : c’est l’alerte.',
        ],
        doc: 'docs/import-auto.md',
        maj: '2026-10-23',
      },
      {
        id: 'elo-ta',
        titre: 'Mettre à jour les Elo Tennis Abstract',
        resume: 'Rafraîchir les notes Elo de la source Tennis Abstract.',
        quand: 'Environ une fois par semaine si la source est `ta`, ou en secours si l’Elo maison est indisponible.',
        etapes: [
          'Ouvrir `Importer` puis la page `Elo`.',
          'Suivre les étapes de l’écran : copier le snippet, l’exécuter sur la page Tennis Abstract dans le navigateur, coller le résultat.',
          'Un circuit à la fois, ou les deux ensemble.',
        ],
        attention: [
          'Tennis Abstract refuse les requêtes serveur (403) : c’est toujours le navigateur qui lit.',
          'Avec la source `maison` (actuelle), ce geste n’est pas nécessaire au quotidien : l’Elo maison se met à jour tout seul.',
        ],
        doc: 'README.md (écran `/import/elo`)',
        maj: '2026-10-23',
      },
      {
        id: 'elo-maison',
        titre: 'Elo maison : contrôler, basculer, ré-amorcer',
        resume: 'Notre propre Elo, mis à jour chaque jour par le passage automatique.',
        quand: 'Pour vérifier qu’il tourne, changer de source, ou après un gros retard.',
        etapes: [
          'Contrôle : le contrôle `sante` de la prod (voir « Vérifier que la prod va bien ») montre la date du dernier jour traité.',
          'Changer de source : dans Vercel, variable `SOURCE_ELO` = `maison` (notre Elo) ou `ta` / vide (Tennis Abstract), puis redéployer.',
          'Retard de 3 jours ou plus : le passage automatique échoue et GitHub envoie un e-mail. Plus de 10 jours : ne pas rattraper, ré-amorcer.',
          'Ré-amorçage : demander à Claude (ça rejoue tout l’historique et remplace les notes en production, donc toujours avec ton accord).',
        ],
        attention: [
          'Avant un ré-amorçage, il faut combler l’archive (figée à juin 2026) avec l’API : ~50 requêtes par jour, donc plusieurs jours.',
          'L’Elo maison consomme 1 à 3 requêtes API par circuit et par jour, sur le même quota que les tableaux.',
        ],
        doc: 'docs/elo-maison.md',
        maj: '2026-10-23',
      },
      {
        id: 'bracket-thomas',
        titre: 'Synchroniser le bracket de Thomas',
        resume: 'Reporter les pronostics de Thomas, Laki et les miens.',
        quand: 'À la demande, pour un tournoi présent dans l’API bracket de Thomas.',
        etapes: [
          'Ouvrir `Importer` puis `Synchroniser le bracket de Thomas`.',
          'Choisir le tournoi ; faire d’abord un aperçu.',
          'Lancer la synchro (jamais de suppression ; les écarts sont signalés sans écraser).',
        ],
        attention: [
          'Ne se lance jamais toute seule.',
          'Ligne de commande équivalente : `npm run sync:bracket-thomas -- --liste` (ou `--tournoi=<id> --apercu`).',
        ],
        doc: 'CLAUDE.md (section externe/)',
        maj: '2026-10-23',
      },
    ],
  },
  {
    id: 'controle',
    titre: 'Contrôles et sécurité',
    procedures: [
      {
        id: 'verifier-prod',
        titre: 'Vérifier que la prod va bien',
        resume: 'Contrôle en lecture seule, sans se connecter.',
        quand: 'Après un déploiement, ou au moindre doute.',
        etapes: [
          'Demander à Claude de lancer le contrôle `sante` : il donne les dernières dates de calcul (matchs, projections, fantasy, historique).',
          'Pour comparer l’équipe Fantasy stockée et l’équipe affichée : contrôle `fantasy-equipe` avec l’identifiant du tournoi.',
        ],
        attention: [
          'Le jeton est `VERIF_TOKEN` : il ne s’affiche jamais, ne se copie jamais dans une conversation.',
          'Pour couper l’accès d’urgence : supprimer `VERIF_TOKEN` dans Vercel et redéployer.',
        ],
        doc: 'CLAUDE.md (Vérifier la prod)',
        maj: '2026-10-23',
      },
      {
        id: 'tourner-un-jeton',
        titre: 'Changer un jeton ou une clé',
        resume: 'Renouveler un secret sans l’exposer.',
        quand: 'Au moindre doute de fuite, ou régulièrement.',
        etapes: [
          'Générer la nouvelle valeur soi-même (par exemple `openssl rand -base64 32`), sans la coller dans une conversation.',
          'Vercel : Settings, Environment Variables, modifier la variable (type sensitive), puis redéployer.',
          'Remplacer la valeur dans `.env.local`.',
          'Contrôler : le nouveau jeton répond, l’ancien est refusé.',
          'Cas de `IMPORT_AUTO_TOKEN` : mettre aussi la nouvelle valeur dans le userscript Tampermonkey (stockage `importAuto.jeton`) et dans le secret GitHub du workflow.',
        ],
        attention: [
          'Jamais de clé secrète préfixée `NEXT_PUBLIC_` : elle serait visible dans le navigateur.',
        ],
        doc: 'docs/import-auto.md',
        maj: '2026-10-23',
      },
    ],
  },
  {
    id: 'dev',
    titre: 'Développement avec Claude',
    procedures: [
      {
        id: 'changement-de-code',
        titre: 'Faire et livrer un changement',
        resume: 'Le chemin d’un changement, de la demande à la production.',
        quand: 'Pour toute modification de l’app.',
        etapes: [
          'Décrire la demande à Claude ; il travaille sur une branche, jamais directement sur `main`.',
          'Avant de livrer, quatre contrôles : `npx tsc --noEmit`, `npx vitest run`, `npm run lint`, `npm run verify:rls`.',
          'Claude ouvre une PR sur GitHub avec le résumé ; après ton accord elle est fusionnée.',
          'La fusion déclenche le déploiement sur Vercel : vérifier la prod (voir « Vérifier que la prod va bien »).',
        ],
        attention: [
          'Claude demande avant toute suppression de fichier ou migration.',
          'Si une variable d’environnement change dans Vercel, il faut redéployer pour qu’elle s’applique.',
        ],
        maj: '2026-10-23',
      },
      {
        id: 'migration',
        titre: 'Ajouter une migration (base de données)',
        resume: 'Changer la structure de la base Supabase, proprement.',
        quand: 'Nouvelle table, nouvelle colonne, nouvelle fonction SQL.',
        etapes: [
          'Créer un nouveau fichier numéroté dans `supabase/migrations/` (jamais modifier une ancienne).',
          'Ajouter une ligne dans `MIGRATIONS.md` (avec sa requête de vérification).',
          'Nouvelle table : RLS activée, une policy de lecture, retrait des droits d’écriture, et ajout dans la liste `TABLES` de `scripts/verifier-rls.mjs`.',
          'Après accord, appliquer dans l’éditeur SQL Supabase, puis `npm run verify:rls` doit afficher « Tout est conforme ».',
          'Noter la date d’application dans `MIGRATIONS.md`.',
        ],
        attention: [
          'La base Supabase est partagée avec d’autres projets : ne jamais toucher à leurs tables.',
          'Les écritures passent uniquement par le serveur (service role), jamais par la clé publique.',
        ],
        doc: 'MIGRATIONS.md',
        maj: '2026-10-23',
      },
      {
        id: 'ajouter-une-procedure',
        titre: 'Ajouter ou corriger une procédure ici',
        resume: 'Garder cet onglet à jour.',
        quand: 'Chaque fois qu’un geste change ou qu’on en invente un nouveau.',
        etapes: [
          'Demander à Claude : « ajoute / corrige la procédure X dans l’onglet Procédures ».',
          'Il modifie `app/procedures/procedures.ts` (une entrée = un titre, un résumé, quand, des étapes courtes, la date de mise à jour).',
          'Les tests vérifient que chaque entrée est complète et qu’aucun secret n’y est collé.',
        ],
        maj: '2026-10-23',
      },
    ],
  },
];
