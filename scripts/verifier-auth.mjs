/**
 * Vérifie la protection par mot de passe contre un serveur qui tourne.
 *
 *   npm run build && npm start          # dans un terminal
 *   node --env-file=.env.local scripts/verifier-auth.mjs [http://localhost:3000]
 *
 * Contrôle surtout le point critique : les endpoints d'ÉCRITURE
 * (/api/recompute, Server Actions) doivent répondre 401 sans cookie valide.
 */
const base = process.argv[2] ?? 'http://localhost:3000';
const motDePasse = process.env.APP_PASSWORD;

let ko = 0;
const ok = (m) => console.log(`  \x1b[32mOK\x1b[0m   ${m}`);
const bad = (m) => { ko++; console.log(`  \x1b[31mKO\x1b[0m   ${m}`); };
const verifier = (cond, m) => (cond ? ok(m) : bad(m));

const recompute = (cookie, entetes = {}) =>
  fetch(`${base}/api/recompute`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...entetes,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    // UUID inexistant : recalcule 0 pick, n'altère aucune donnée.
    body: JSON.stringify({ tournament_id: '00000000-0000-0000-0000-000000000000' }),
  });

console.log(`\nSANS COOKIE (${base})`);
{
  const r = await recompute(null);
  verifier(r.status === 401, `POST /api/recompute → ${r.status} (attendu 401)`);

  for (const p of ['/', '/import', '/tournoi/x/picks', '/tournoi/x/resultats']) {
    const res = await fetch(base + p, { redirect: 'manual' });
    const vers = res.headers.get('location') ?? '';
    verifier(
      res.status >= 300 && res.status < 400 && vers.includes('/login'),
      `GET ${p} → ${res.status} vers ${vers || '—'} (attendu redirection /login)`,
    );
  }

  // Server Action : POST vers la route hôte, reconnaissable au header next-action.
  const sa = await fetch(`${base}/import`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'next-action': 'x', 'Content-Type': 'text/plain;charset=UTF-8' },
    body: '[]',
  });
  verifier(sa.status === 401, `POST Server Action /import → ${sa.status} (attendu 401)`);

  const login = await fetch(`${base}/login`, { redirect: 'manual' });
  verifier(login.status === 200, `GET /login → ${login.status} (attendu 200)`);
}

console.log('\nCOOKIE FORGÉ / ALTÉRÉ');
{
  for (const [nom, c] of [
    ['valeur arbitraire', 'tn_session=nimportequoi'],
    ['signature bidon', 'tn_session=eyJleHAiOjk5OTk5OTk5OTl9.signature'],
    ['charge non signée', `tn_session=${Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64url')}.`],
  ]) {
    const r = await recompute(c);
    verifier(r.status === 401, `POST /api/recompute (${nom}) → ${r.status} (attendu 401)`);
  }
}

console.log('\nCONTOURNEMENT DU PROXY (défense en profondeur)');
{
  // CVE-2025-29927 : un en-tête interne forgé faisait sauter le middleware.
  // Corrigé depuis, mais la garde dans la route doit tenir seule de toute façon.
  for (const v of ['proxy', 'middleware', 'src/middleware', 'pages/_middleware']) {
    const r = await recompute(null, { 'x-middleware-subrequest': v });
    verifier(r.status === 401, `x-middleware-subrequest: ${v} → ${r.status} (attendu 401)`);
  }
}

console.log('\nCONNEXION');
if (!motDePasse) {
  bad('APP_PASSWORD absent de l’environnement : test de connexion impossible');
} else {
  // Le formulaire de login est une Server Action : on rejoue exactement le POST
  // qu'enverrait un navigateur sans JavaScript (champ caché $ACTION_ID_…).
  const html = await (await fetch(`${base}/login`)).text();
  const actionId = html.match(/\$ACTION_ID_([0-9a-f]+)/i)?.[1];
  verifier(!!actionId, 'identifiant de Server Action présent dans le HTML');

  const poster = (mdp) => {
    const form = new FormData();
    form.set(`$ACTION_ID_${actionId}`, '');
    form.set('next', '');
    form.set('motDePasse', mdp);
    return fetch(`${base}/login`, { method: 'POST', redirect: 'manual', body: form });
  };

  const mauvais = await poster('mauvais-mot-de-passe');
  verifier(
    !(mauvais.headers.get('set-cookie') ?? '').includes('tn_session='),
    'mauvais mot de passe → aucun cookie de session émis',
  );

  const bon = await poster(motDePasse);
  const setCookie = bon.headers.get('set-cookie') ?? '';
  const jeton = setCookie.match(/tn_session=([^;]+)/)?.[1];

  verifier(!!jeton, 'bon mot de passe → cookie de session émis');
  verifier(/HttpOnly/i.test(setCookie), 'cookie HttpOnly');
  verifier(/SameSite=Lax/i.test(setCookie), 'cookie SameSite=Lax');
  verifier(
    !!jeton && jeton.includes('.') && jeton.split('.')[1].length > 20,
    'cookie signé (charge.signature)',
  );

  if (jeton) {
    const r = await recompute(`tn_session=${jeton}`);
    verifier(r.status === 200, `POST /api/recompute avec session → ${r.status} (attendu 200)`);

    const home = await fetch(base + '/', {
      redirect: 'manual',
      headers: { Cookie: `tn_session=${jeton}` },
    });
    verifier(home.status === 200, `GET / avec session → ${home.status} (attendu 200)`);

    // Une charge modifiée doit casser la signature.
    const [charge, sig] = jeton.split('.');
    const altere = `${Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64url')}.${sig}`;
    const r2 = await recompute(`tn_session=${altere}`);
    verifier(r2.status === 401, `expiration réécrite → ${r2.status} (attendu 401)`);
    void charge;
  }
}

console.log(ko === 0 ? '\n\x1b[32mTout est conforme.\x1b[0m\n' : `\n\x1b[31m${ko} problème(s).\x1b[0m\n`);
process.exit(ko === 0 ? 0 : 1);
