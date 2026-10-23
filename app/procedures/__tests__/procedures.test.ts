import { describe, expect, it } from 'vitest';
import { GROUPES } from '../procedures';

const toutes = GROUPES.flatMap((g) => g.procedures);

/** Tous les textes de l'onglet, pour les contrôles de contenu. */
function textes(): string[] {
  return toutes.flatMap((p) => [
    p.titre,
    p.resume,
    p.quand,
    ...p.etapes,
    ...(p.attention ?? []),
    p.doc ?? '',
  ]);
}

describe('onglet Procédures', () => {
  it('a du contenu', () => {
    expect(GROUPES.length).toBeGreaterThan(0);
    expect(toutes.length).toBeGreaterThan(0);
  });

  it('chaque identifiant est unique et utilisable comme ancre', () => {
    const ids = [...GROUPES.map((g) => g.id), ...toutes.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('chaque procédure est complète', () => {
    for (const p of toutes) {
      expect(p.titre.trim(), p.id).not.toBe('');
      expect(p.resume.trim(), p.id).not.toBe('');
      expect(p.quand.trim(), p.id).not.toBe('');
      expect(p.etapes.length, p.id).toBeGreaterThan(0);
      for (const e of p.etapes) expect(e.trim(), p.id).not.toBe('');
      expect(p.maj, p.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(p.maj)), p.id).toBe(false);
    }
  });

  it('les accents graves sont toujours appariés', () => {
    for (const t of textes()) {
      expect((t.match(/`/g) ?? []).length % 2, t).toBe(0);
    }
  });

  it('ne contient aucune valeur secrète collée par erreur', () => {
    const interdits: RegExp[] = [
      /bk_live_[A-Za-z0-9]{8,}/, // clé Game Tracker
      /sbp_[A-Za-z0-9]{8,}/, // jeton d'accès Supabase
      /eyJ[A-Za-z0-9_-]{20,}/, // JWT (clés Supabase anon / service role)
      /[A-Za-z0-9+/]{32,}={0,2}/, // longue chaîne base64 / hexadécimale
    ];
    for (const t of textes()) {
      for (const re of interdits) expect(t, `motif ${re}`).not.toMatch(re);
    }
  });
});
