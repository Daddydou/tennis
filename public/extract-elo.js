/*
 * EXTRACTION DES ELO TENNIS ABSTRACT — SNIPPET NAVIGATEUR
 *
 * À exécuter sur :
 *   https://tennisabstract.com/reports/atp_elo_ratings.html
 *   https://tennisabstract.com/reports/wta_elo_ratings.html
 *
 * Produit le JSON attendu par /import/elo et le copie dans le presse-papier.
 *
 * POURQUOI un snippet plutôt qu'un fetch serveur : Tennis Abstract répond 403
 * aux requêtes venant des IP de datacenter (Vercel). La page reste parfaitement
 * accessible depuis un navigateur ordinaire — c'est donc le navigateur qui lit
 * la page, et l'app qui reçoit le résultat par collage.
 *
 * Le fichier vit dans `public/` pour être servi par l'app elle-même
 * (/extract-elo.js, derrière le mot de passe comme le reste) : l'écran
 * /import/elo propose de le copier en un clic. Il n'est jamais chargé comme
 * script de l'app.
 *
 * USAGE
 *   1. Ouvrir la page du rapport (ATP ou WTA).
 *   2. Coller tout ce fichier dans la console (F12 → Console) et valider.
 *   3. Le JSON est dans le presse-papier → le coller dans /import/elo.
 *
 * En faire un vrai marque-page : copier tout le fichier dans le champ URL d'un
 * marque-page en préfixant « javascript: ». Le code ci-dessous n'utilise que des
 * commentaires /* *\/ et aucun commentaire de fin de ligne, précisément pour
 * survivre à l'aplatissement sur une seule ligne que fait le gestionnaire de
 * marque-pages.
 */

(function () {
  /* Le circuit vient de l'URL : rien dans la page ne le dit de façon fiable. */
  var url = String(location.href);
  var tour = /wta_elo/i.test(url) ? 'wta' : /atp_elo/i.test(url) ? 'atp' : null;
  if (!tour) {
    alert(
      "Cette page n'est pas un rapport Elo Tennis Abstract.\n\n" +
        'Ouvrir :\n' +
        'https://tennisabstract.com/reports/atp_elo_ratings.html\n' +
        'https://tennisabstract.com/reports/wta_elo_ratings.html',
    );
    return;
  }

  var table = document.getElementById('reportable');
  if (!table) {
    alert('Tableau « reportable » introuvable : format de page modifié ?');
    return;
  }

  /* Espaces insécables compris : les intitulés en sont truffés (« Elo&nbsp;Rank »). */
  function texte(el) {
    return (el && el.textContent ? el.textContent : '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function nombre(s) {
    var t = String(s).replace(/[^0-9.\-]/g, '');
    if (!t || t === '-' || t === '.') return null;
    var n = Number(t);
    return isFinite(n) ? n : null;
  }

  /*
   * Les colonnes sont repérées par leur INTITULÉ, jamais par leur position : le
   * rapport en compte 17, dont des colonnes d'espacement vides, et l'ordre peut
   * bouger d'une refonte à l'autre. Même règle que le parser serveur.
   */
  var thead = table.querySelector('thead');
  var entetes = [].map.call(thead ? thead.querySelectorAll('th') : [], function (th) {
    return texte(th).toLowerCase();
  });

  function colonne() {
    for (var i = 0; i < arguments.length; i++) {
      var j = entetes.indexOf(arguments[i]);
      if (j !== -1) return j;
    }
    return -1;
  }

  var iNom = colonne('player');
  var iElo = colonne('elo');
  var iHard = colonne('helo');
  var iClay = colonne('celo');
  var iGrass = colonne('gelo');
  /* « ATP Rank » ou « WTA Rank » selon le circuit. */
  var iRang = colonne(tour + ' rank', 'atp rank', 'wta rank');

  if (iNom === -1 || iElo === -1) {
    alert('Colonnes Player/Elo absentes. Intitulés lus :\n' + entetes.join(' | '));
    return;
  }

  var lignes = table.querySelectorAll('tbody tr');
  var joueurs = [];
  for (var k = 0; k < lignes.length; k++) {
    var tds = lignes[k].querySelectorAll('td');
    if (tds.length <= iElo) continue;

    var nom = texte(tds[iNom]);
    if (!nom) continue;

    /*
     * Le slug vit dans le lien de la cellule « Player »
     * (player.cgi?p=AndresMartin). C'est la SEULE identité fiable : deux
     * homonymes ont des slugs distincts là où leurs noms normalisés sont
     * identiques. Repli sur le nom sans espaces, qui est la règle de
     * construction des slugs TA.
     */
    var lien = tds[iNom].querySelector('a[href*="player.cgi"]');
    var m = lien ? String(lien.getAttribute('href')).match(/[?&]p=([^&#]+)/) : null;
    var slug = m ? decodeURIComponent(m[1]) : nom.replace(/\s+/g, '');

    joueurs.push({
      ta_slug: slug,
      nom: nom,
      elo_overall: nombre(texte(tds[iElo])),
      elo_hard: iHard === -1 ? null : nombre(texte(tds[iHard])),
      elo_clay: iClay === -1 ? null : nombre(texte(tds[iClay])),
      elo_grass: iGrass === -1 ? null : nombre(texte(tds[iGrass])),
      atp_rank: iRang === -1 ? null : nombre(texte(tds[iRang])),
    });
  }

  if (!joueurs.length) {
    alert('Aucune ligne de joueur extraite : format de page modifié ?');
    return;
  }

  /* Date « Last update » annoncée en tête du rapport. */
  var maj = texte(document.body).match(/Last update:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);

  var extrait = {
    source: 'tennisabstract-elo',
    tour: tour,
    updated: maj ? maj[1] : null,
    players: joueurs,
  };

  var json = JSON.stringify(extrait);
  var resume =
    tour.toUpperCase() +
    ' : ' +
    joueurs.length +
    ' joueurs' +
    (extrait.updated ? ' (maj ' + extrait.updated + ')' : '');

  /*
   * Copie : l'API presse-papier d'abord, execCommand ensuite (elle marche même
   * si le document n'a pas le focus), et en dernier recours un textarea plein
   * écran à copier à la main — mieux qu'une extraction perdue.
   */
  function manuel() {
    var fond = document.createElement('div');
    fond.setAttribute(
      'style',
      'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.7);display:flex;flex-direction:column;padding:16px;gap:8px',
    );
    var titre = document.createElement('div');
    titre.setAttribute('style', 'color:#fff;font:14px system-ui');
    titre.textContent =
      resume + ' — copie automatique refusée : tout sélectionner (Ctrl+A) puis copier (Ctrl+C).';
    var zone = document.createElement('textarea');
    zone.setAttribute('style', 'flex:1;width:100%;font:12px monospace');
    zone.value = json;
    var fermer = document.createElement('button');
    fermer.setAttribute('style', 'align-self:flex-start;padding:6px 12px;font:14px system-ui');
    fermer.textContent = 'Fermer';
    fermer.onclick = function () {
      document.body.removeChild(fond);
    };
    fond.appendChild(titre);
    fond.appendChild(zone);
    fond.appendChild(fermer);
    document.body.appendChild(fond);
    zone.focus();
    zone.select();
  }

  function execCommand() {
    var zone = document.createElement('textarea');
    zone.value = json;
    zone.setAttribute('style', 'position:fixed;top:0;left:0;opacity:0');
    document.body.appendChild(zone);
    zone.focus();
    zone.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(zone);
    return ok;
  }

  function reussite() {
    alert(resume + '\n\nJSON copié dans le presse-papier → coller dans /import/elo.');
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(reussite, function () {
      if (execCommand()) reussite();
      else manuel();
    });
  } else if (execCommand()) {
    reussite();
  } else {
    manuel();
  }
})();
