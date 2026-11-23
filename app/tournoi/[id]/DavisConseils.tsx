import { carte, noteInfo, boutonSecondaire } from '@/app/ui';
import { eloMaisonDe, lireEtatDavis, NOMS_ELO_DAVIS } from '@/db/davisConseils';
import {
  analyseRencontre,
  analyseTableau,
  composition,
  plansPicks,
  type AnalyseRencontre,
  type Composition,
  type RencontreEtat,
  type TourDavis,
} from '@/lib/davisConseils';
import { EQUIPES_DAVIS_2026, joueursDeSimple, programmeQuart, type CodeNation, type EquipeDavis } from '@/lib/davisEquipes';

/**
 * Onglet « Pronos » d'une Coupe Davis : chances de chaque nation et conseils pour les trois jeux de
 * Thomas (picks par pays, bracket des nations, pronos des matchs), d'après l'Elo maison des joueurs
 * sélectionnés et la composition de chaque rencontre. Lecture seule : rien n'est enregistré ici, les
 * choix se posent sur Game Tracker.
 *
 * La composition (qui joue le simple 1 et le simple 2) se choisit dans l'écran : elle passe par l'adresse
 * de la page (?QF1_s1a=...), sans rien écrire en base. Par défaut : les numéros 2 au simple 1, les
 * numéros 1 au simple 2, d'après le classement ATP.
 */

const TOURS: TourDavis[] = ['QF', 'SF', 'F'];
const LIBELLE_TOUR: Record<TourDavis, string> = { QF: 'Quart', SF: 'Demie', F: 'Finale' };
const MULTIPLICATEUR: Record<TourDavis, number> = { QF: 1, SF: 2, F: 3 };
const pct = (p: number) => `${Math.round(p * 100)} %`;
const equipe = (c: CodeNation) => EQUIPES_DAVIS_2026.find((e) => e.code === c)!;
const nom = (c: CodeNation | null) => (c ? equipe(c).nom : '?');

type Recherche = Record<string, string | string[] | undefined>;
const cleR = (r: { tour: TourDavis; position: number }) => `${r.tour}${r.position}`;

export default async function DavisConseils({ id, recherche }: { id: string; recherche: Recherche }) {
  const [etat, elo] = await Promise.all([lireEtatDavis(id), eloMaisonDe(NOMS_ELO_DAVIS)]);
  const { rencontres, mesPicks, inconnues } = etat;
  const valeur = (k: string) => {
    const v = recherche[k];
    return (Array.isArray(v) ? v[0] : v) || null;
  };

  // Composition choisie (ou par défaut) pour chaque rencontre aux deux nations connues.
  const compos = new Map<string, Composition>();
  for (const r of rencontres) {
    if (!r.nation1 || !r.nation2) continue;
    const k = cleR(r);
    compos.set(
      `${r.nation1}|${r.nation2}`,
      composition(equipe(r.nation1), equipe(r.nation2), elo, {
        simple1: [valeur(`${k}_s1a`), valeur(`${k}_s1b`)],
        simple2: [valeur(`${k}_s2a`), valeur(`${k}_s2b`)],
      }),
    );
  }
  const cache = new Map<string, AnalyseRencontre>();
  const analyser = (a: CodeNation, b: CodeNation): AnalyseRencontre => {
    const k = `${a}|${b}`;
    if (!cache.has(k)) {
      const c = compos.get(k) ?? composition(equipe(a), equipe(b), elo);
      cache.set(k, analyseRencontre(c, [equipe(a).domicile, equipe(b).domicile]));
    }
    return cache.get(k)!;
  };

  const quartsComplets = [0, 1, 2, 3].every((i) => rencontres.some((r) => r.tour === 'QF' && r.position === i && r.nation1 && r.nation2));
  if (!quartsComplets || inconnues.length) {
    return (
      <p className={noteInfo}>
        Conseils indisponibles : {inconnues.length ? `nation(s) inconnue(s) dans lib/davisEquipes.ts : ${inconnues.join(', ')}.` : 'les quarts ne sont pas encore tous connus.'}
      </p>
    );
  }

  const tableau = analyseTableau(rencontres, analyser);
  const utilises = new Set(mesPicks.map((p) => p.nation));
  const plans = utilises.size === 0 ? plansPicks(rencontres, analyser) : [];
  // Dans l'ordre RÉEL des rencontres (programme officiel des quarts), pas celui du tableau.
  const ordreQuart = (r: RencontreEtat) => (r.tour === 'QF' ? (programmeQuart(r.nation1!, r.nation2!)?.date ?? `z${r.position}`) : `z${r.position}`);
  const aJouer = rencontres
    .filter((r) => r.nation1 && r.nation2 && !r.vainqueur)
    .sort((a, b) => TOURS.indexOf(a.tour) - TOURS.indexOf(b.tour) || ordreQuart(a).localeCompare(ordreQuart(b)));
  // Prochain tour à picker : le premier tour dont une rencontre reste à jouer.
  const tourOuvert = aJouer[0]?.tour ?? null;
  const optionsPick =
    tourOuvert && utilises.size > 0
      ? aJouer
          .filter((r) => r.tour === tourOuvert)
          .flatMap((r) => [
            { nation: r.nation1!, adversaire: r.nation2!, a: analyser(r.nation1!, r.nation2!), cote: 'A' as const },
            { nation: r.nation2!, adversaire: r.nation1!, a: analyser(r.nation1!, r.nation2!), cote: 'B' as const },
          ])
          .map((o) => ({ ...o, p: o.cote === 'A' ? o.a.pA : 1 - o.a.pA, points: o.cote === 'A' ? o.a.pointsPickA : o.a.pointsPickB, deja: utilises.has(o.nation) }))
          .sort((x, y) => y.points - x.points)
      : [];

  return (
    <div className="space-y-6" data-testid="davis-conseils">
      <p className={noteInfo}>
        Conseils calculés avec l&apos;Elo maison (surface dur) des joueurs sélectionnés, la composition de chaque rencontre et une note pour chaque paire de double ; l&apos;Italie joue à domicile.
        Rien n&apos;est enregistré ici : les choix se posent sur Game Tracker.
      </p>

      {/* 1. Chances */}
      <section className={`${carte} space-y-3 p-4`}>
        <h2 className="text-sm">Chances de chaque nation</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="py-1 font-normal">Nation</th>
              <th className="py-1 text-right font-normal">Demie</th>
              <th className="py-1 text-right font-normal">Finale</th>
              <th className="py-1 text-right font-normal">Titre</th>
            </tr>
          </thead>
          <tbody>
            {tableau.chances.map((c) => (
              <tr key={c.nation} className="border-t border-white/6">
                <td className="py-1.5">{nom(c.nation)}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(c.demie)}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(c.finale)}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{pct(c.titre)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 2. Picks par pays */}
      <section className={`${carte} space-y-3 p-4`}>
        <h2 className="text-sm">Picks par pays</h2>
        {plans.length > 0 ? (
          <>
            <p className="text-xs text-zinc-600">
              Un pays par moitié en quart. Les points comptent les quatre picks : la demie et la finale sont choisies au mieux une fois les adversaires connus (un pays ne sert qu&apos;une fois).
            </p>
            <ol className="space-y-1 text-sm">
              {plans.slice(0, 5).map((p, i) => (
                <li key={`${p.quartHaut}${p.quartBas}`} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/6 py-1.5">
                  <span className={i === 0 ? 'font-medium text-accent' : ''}>
                    {nom(p.quartHaut)} + {nom(p.quartBas)}
                  </span>
                  <span className="text-xs tabular-nums text-zinc-600">
                    {p.points.toFixed(1)} pts attendus (quarts {p.pointsQuarts.toFixed(1)}) · finale sans pays disponible : {pct(p.pFinaleSansPick)}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : optionsPick.length > 0 ? (
          <>
            <p className="text-xs text-zinc-600">
              Déjà pickés : {mesPicks.map((p) => nom(p.nation)).join(', ')}. Pour {LIBELLE_TOUR[tourOuvert!].toLowerCase()}, les pays encore disponibles, du plus rentable au moins rentable :
            </p>
            <ol className="space-y-1 text-sm">
              {optionsPick.map((o) => (
                <li key={o.nation} className={`flex flex-wrap items-baseline justify-between gap-2 border-t border-white/6 py-1.5 ${o.deja ? 'text-zinc-500 line-through' : ''}`}>
                  <span>
                    {nom(o.nation)} <span className="text-xs text-zinc-500">contre {nom(o.adversaire)}</span>
                  </span>
                  <span className="text-xs tabular-nums text-zinc-600">
                    {pct(o.p)} de gagner · {o.points.toFixed(1)} pts attendus{o.deja ? ' · déjà utilisé' : ''}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-xs text-zinc-600">Plus de pick à poser.</p>
        )}
      </section>

      {/* 3. Bracket des nations */}
      <section className={`${carte} space-y-3 p-4`}>
        <h2 className="text-sm">Bracket des nations conseillé</h2>
        <p className="text-xs text-zinc-600">Le choix qui rapporte le plus en moyenne (bonne nation 2 / 4 / 8 pts, bon score en plus 1 / 2 / 4), cohérent d&apos;un tour à l&apos;autre.</p>
        <ul className="space-y-1 text-sm">
          {tableau.bracket.map((b) => (
            <li key={`${b.tour}${b.position}`} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/6 py-1.5">
              <span>
                <span className="text-xs text-zinc-500">
                  {LIBELLE_TOUR[b.tour]}
                  {b.tour !== 'F' ? ` ${b.position + 1}` : ''}
                </span>{' '}
                <span className="font-medium">{nom(b.nation)}</span> {b.score}
              </span>
              <span className="text-xs tabular-nums text-zinc-600">
                nation {pct(b.pNation)} · score exact {pct(b.pExact)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 4. Pronos des matchs, rencontre par rencontre */}
      <section className="space-y-3">
        <h2 className="text-sm">Pronos des matchs</h2>
        {aJouer.length === 0 && <p className="text-xs text-zinc-600">Toutes les rencontres connues sont jouées.</p>}
        {aJouer.map((r) => (
          <CarteRencontre key={cleR(r)} r={r} a={analyser(r.nation1!, r.nation2!)} compo={compos.get(`${r.nation1}|${r.nation2}`)!} recherche={recherche} />
        ))}
      </section>

      {/* 5. Équipes */}
      <section className={`${carte} space-y-3 p-4`}>
        <h2 className="text-sm">Équipes et Elo</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {EQUIPES_DAVIS_2026.map((e) => (
            <div key={e.code} className="space-y-1 text-sm">
              <p className="font-medium">
                {e.nom} <span className="text-xs font-normal text-zinc-500">· capitaine {e.capitaine}</span>
              </p>
              <ul className="space-y-0.5 text-xs text-zinc-700">
                {e.joueurs.map((j) => (
                  <li key={j.nom} className="flex justify-between gap-2">
                    <span>
                      {j.nom} <span className="text-zinc-500">({j.role === 'double' ? 'double' : 'simple'}{j.classement ? `, ${j.classement}e` : ''})</span>
                    </span>
                    <span className="tabular-nums text-zinc-600">{j.role === 'simple' ? (j.nomElo && elo.has(j.nomElo) ? `Elo ${Math.round(elo.get(j.nomElo)!)}` : 'Elo inconnu') : ''}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-2 text-zinc-500">
                  <span>Double pressenti : {e.pairePressentie}</span>
                  <span className="tabular-nums">note {e.noteDouble}</span>
                </li>
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CarteRencontre({ r, a, compo, recherche }: { r: RencontreEtat; a: AnalyseRencontre; compo: Composition; recherche: Recherche }) {
  const k = cleR(r);
  const ea = equipe(r.nation1!);
  const eb = equipe(r.nation2!);
  const carton = a.matchs.filter((m) => m.pJoue === 1).reduce((p, m) => p * m.meilleurProno.pExact, 1);
  return (
    <div className={`${carte} space-y-3 p-4`} data-testid={`rencontre-${k}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          <span className="text-xs font-normal text-zinc-500">
            {LIBELLE_TOUR[r.tour]}
            {r.tour !== 'F' ? ` ${r.position + 1}` : ''} · points ×{MULTIPLICATEUR[r.tour]}
          </span>{' '}
          {ea.nom} – {eb.nom}
          {r.tour === 'QF' && programmeQuart(r.nation1!, r.nation2!) && (
            <span className="block text-xs font-normal text-accent">{programmeQuart(r.nation1!, r.nation2!)!.libelle} · pronos à poser avant</span>
          )}
        </p>
        <p className="text-xs tabular-nums text-zinc-600">
          {ea.nom} {pct(a.pA)} · 2-0 {pct(a.issues.A20)}, 2-1 {pct(a.issues.A21)} · {eb.nom} 2-1 {pct(a.issues.B21)}, 2-0 {pct(a.issues.B20)}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="py-1 font-normal">Match</th>
            <th className="py-1 font-normal">{ea.nom}</th>
            <th className="py-1 font-normal">{eb.nom}</th>
            <th className="py-1 text-right font-normal">Prono conseillé</th>
          </tr>
        </thead>
        <tbody>
          {a.matchs.map((m) => {
            const nation = m.meilleurProno.cote === 'A' ? ea.nom : eb.nom;
            return (
              <tr key={m.libelle} className="border-t border-white/6 align-top">
                <td className="py-1.5 text-xs text-zinc-500">
                  {m.libelle}
                  {m.libelle === 'Double' && <span className="block">joué à 1-1 : {pct(m.pJoue)}</span>}
                </td>
                <td className="py-1.5">
                  {m.joueurA}
                  {m.eloA !== null && <span className="block text-xs tabular-nums text-zinc-500">Elo {Math.round(m.eloA)}</span>}
                </td>
                <td className="py-1.5">
                  {m.joueurB}
                  {m.eloB !== null && <span className="block text-xs tabular-nums text-zinc-500">Elo {Math.round(m.eloB)}</span>}
                </td>
                <td className="py-1.5 text-right">
                  <span className="font-medium">
                    {nation} {m.meilleurProno.score}
                  </span>
                  <span className="block text-xs tabular-nums text-zinc-500">
                    {nation} {pct(m.meilleurProno.pNation)} · exact {pct(m.meilleurProno.pExact)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-zinc-500">Carton plein sur les deux simples avec ces pronos : {pct(carton)}.</p>

      {/* Composition : formulaire GET, rien n'est écrit en base. */}
      <form method="get" className="flex flex-wrap items-end gap-3 text-xs">
        {/* Les choix des autres rencontres sont conservés. */}
        {Object.entries(recherche)
          .filter(([cle]) => !cle.startsWith(`${k}_`))
          .map(([cle, v]) => (
            <input key={cle} type="hidden" name={cle} value={Array.isArray(v) ? v[0] : (v ?? '')} />
          ))}
        <ChoixJoueur nom={`${k}_s1a`} libelle={`Simple 1 · ${ea.nom}`} equipe={ea} valeur={compo.simple1[0].nom} />
        <ChoixJoueur nom={`${k}_s1b`} libelle={`Simple 1 · ${eb.nom}`} equipe={eb} valeur={compo.simple1[1].nom} />
        <ChoixJoueur nom={`${k}_s2a`} libelle={`Simple 2 · ${ea.nom}`} equipe={ea} valeur={compo.simple2[0].nom} />
        <ChoixJoueur nom={`${k}_s2b`} libelle={`Simple 2 · ${eb.nom}`} equipe={eb} valeur={compo.simple2[1].nom} />
        <button type="submit" className={boutonSecondaire}>
          Recalculer avec cette composition
        </button>
      </form>
    </div>
  );
}

function ChoixJoueur({ nom, libelle, equipe: e, valeur }: { nom: string; libelle: string; equipe: EquipeDavis; valeur: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-zinc-500">{libelle}</span>
      <select name={nom} defaultValue={valeur} className="min-h-11 rounded-md bg-surface-haute px-2 text-sm text-zinc-900 ring-1 ring-white/10">
        {joueursDeSimple(e).map((j) => (
          <option key={j.nom} value={j.nom}>
            {j.nom}
          </option>
        ))}
      </select>
    </label>
  );
}
