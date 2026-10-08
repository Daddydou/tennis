// @vitest-environment node
/**
 * Stockage du bracket de Thomas — db/bracketExterneEcriture.ts.
 * Client Supabase simulé : on vérifie CE QUI serait écrit (upsert seulement,
 * ordre des clés étrangères, rien si incohérent), pas le réseau.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lireBracket } from '@/lib/thomasApi';
import { BracketIncoherent, ecrireBracketExterne, preparerSynchro } from '../bracketExterneEcriture';

// Fichier gitignoré (vrais pseudos et userId de l'app de Thomas) : présent en
// local seulement. Sans lui, ces tests sont ignorés au lieu d'échouer.
const EXEMPLE = fileURLToPath(new URL('../../exemple-api-tennis-brackets.json', import.meta.url));
const PRESENT = existsSync(EXEMPLE);
const BRUT = PRESENT ? JSON.parse(readFileSync(EXEMPLE, 'utf8')) : null;
const avecExemple = describe.skipIf(!PRESENT);
const exemple = () => lireBracket(structuredClone(BRUT));

function faux() {
  const appels: { table: string; op: string; lignes: Record<string, unknown>[]; onConflict?: string }[] = [];
  const interdit = (table: string, op: string) => () => {
    appels.push({ table, op, lignes: [] });
    throw new Error(`${op} interdit`);
  };
  const sb = {
    from: (table: string) => ({
      upsert: async (lignes: Record<string, unknown>[], o: { onConflict: string }) => {
        appels.push({ table, op: 'upsert', lignes, onConflict: o.onConflict });
        return { error: null };
      },
      insert: interdit(table, 'insert'),
      update: interdit(table, 'update'),
      delete: interdit(table, 'delete'),
    }),
  } as unknown as SupabaseClient;
  return { sb, appels };
}

avecExemple('ecrireBracketExterne', () => {
  it('upsert seulement, dans l’ordre des clés étrangères, avec les bonnes clés de conflit', async () => {
    const { sb, appels } = faux();
    await ecrireBracketExterne(sb, exemple());
    expect(appels.map((a) => [a.table, a.op, a.onConflict])).toEqual([
      ['tn_bracket_externe_tournois', 'upsert', 'id'],
      ['tn_bracket_externe_participants', 'upsert', 'tournoi_id,user_id'],
      ['tn_bracket_externe_joueurs', 'upsert', 'tournoi_id,position'],
      ['tn_bracket_externe_matchs', 'upsert', 'tournoi_id,tour,match_index'],
      ['tn_bracket_externe_pronostics', 'upsert', 'tournoi_id,tour,match_index,user_id'],
    ]);
    const n = (t: string) => appels.filter((a) => a.table === t).reduce((s, a) => s + a.lignes.length, 0);
    expect([n('tn_bracket_externe_participants'), n('tn_bracket_externe_joueurs'), n('tn_bracket_externe_matchs'), n('tn_bracket_externe_pronostics')])
      .toEqual([3, 128, 127, 381]);
  });

  it('stocke les deux totaux et joueur_absent ; ne touche jamais tournament_id_interne', async () => {
    const { sb, appels } = faux();
    await ecrireBracketExterne(sb, exemple());
    const tournoi = appels[0].lignes[0];
    expect(tournoi).not.toHaveProperty('tournament_id_interne');
    const parts = appels[1].lignes.map((l) => [l.pseudo, l.points_totaux_thomas, l.points_totaux_calcule]);
    expect(parts).toEqual([['Daddy', 310, 310], ['Laki', 240, 240], ['moustiton', 322, 322]]);
    const pronos = appels.filter((a) => a.table === 'tn_bracket_externe_pronostics').flatMap((a) => a.lignes);
    expect(pronos.filter((p) => p.joueur_absent === true)).toHaveLength(25);
  });

  it('bracket incohérent : BracketIncoherent, rien n’est écrit', async () => {
    const { sb, appels } = faux();
    const b = exemple();
    b.tours[0].matchs[0].pronostics[0].userId = 'inconnu';
    await expect(ecrireBracketExterne(sb, b)).rejects.toBeInstanceOf(BracketIncoherent);
    expect(appels).toEqual([]);
  });

  it('non verrouillé : seule la ligne du tournoi est écrite, sans erreur', async () => {
    const { sb, appels } = faux();
    const b = lireBracket({ ...structuredClone(BRUT), tournoi: { ...BRUT.tournoi, verrouille: false }, participants: [], joueurs: [], tours: [] });
    const r = await ecrireBracketExterne(sb, b);
    expect(r).toMatchObject({ verrouille: false, tours: 0, pronostics: 0, ecartsPoints: [] });
    expect(appels.filter((a) => a.lignes.length > 0).map((a) => a.table)).toEqual(['tn_bracket_externe_tournois']);
  });
});

avecExemple('preparerSynchro — écart de points', () => {
  it('aucun écart sur l’exemple réel', () => {
    expect(preparerSynchro(exemple()).resume.ecartsPoints).toEqual([]);
  });

  it('un pointsTotaux de Thomas faux est remonté, pas masqué', () => {
    const b = exemple();
    b.participants[1].pointsTotaux = 250;
    const { resume, lignes } = preparerSynchro(b);
    expect(resume.ecartsPoints).toEqual([{ userId: b.participants[1].userId, pseudo: 'Laki', thomas: 250, calcule: 240 }]);
    // Les deux valeurs sont stockées telles quelles.
    expect(lignes.participants[1]).toMatchObject({ points_totaux_thomas: 250, points_totaux_calcule: 240 });
  });
});
