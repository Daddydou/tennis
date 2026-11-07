/**
 * Tests de COMPOSANT — liste des tournois (accueil et /tournois), app/tournoisUi.tsx.
 * Pas de base de données : on fournit des TournamentRow à la main.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { TournamentRow } from '@/db/types';
import {
  CarteTournoi,
  commenceDansLaSemaine,
  fraicheur,
  libellePicksAPoser,
  ListeTournois,
} from '../../tournoisUi';

afterEach(() => cleanup());

function tournoi(partiel: Partial<TournamentRow>): TournamentRow {
  return {
    id: 'id-1',
    external_id: null,
    slug: null,
    name: 'Paris 2026',
    tour: 'ATP',
    category: 'M1000',
    surface: 'hard',
    draw_size: 56,
    best_of: 3,
    year: 2026,
    start_date: '2026-11-02',
    status: 'running',
    rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    created_at: null,
    ...partiel,
  };
}

const MASTERS = tournoi({
  id: 'id-masters',
  name: 'WTA Finals 2026',
  tour: 'WTA',
  category: 'finals',
  status: 'upcoming',
  start_date: '2026-11-08',
  rounds: ['J1', 'J2', 'J3', 'SF', 'F'],
});

describe('ListeTournois', () => {
  it('affiche une seule liste, avec un en-tête de colonnes', () => {
    render(<ListeTournois tournois={[tournoi({}), MASTERS]} aujourdHui="2026-11-06" />);
    expect(screen.getAllByRole('list')).toHaveLength(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Statut')).toBeTruthy();
  });

  it('un tournoi à tableau a trois liens : Tableau, Picks, Résultats', () => {
    render(<ListeTournois tournois={[tournoi({})]} aujourdHui="2026-11-06" />);
    const ligne = screen.getByRole('listitem');
    expect(within(ligne).getByRole('link', { name: 'Tableau' }).getAttribute('href')).toBe('/tournoi/id-1/tableau');
    expect(within(ligne).getByRole('link', { name: 'Picks' }).getAttribute('href')).toBe('/tournoi/id-1/picks');
    expect(within(ligne).getByRole('link', { name: 'Résultats' }).getAttribute('href')).toBe('/tournoi/id-1/resultats');
    expect(within(ligne).queryByRole('link', { name: 'Dashboard' })).toBeNull();
  });

  it("un Masters n'a qu'un lien Dashboard (ses autres écrans y renvoient)", () => {
    render(<ListeTournois tournois={[MASTERS]} aujourdHui="2026-11-06" />);
    const ligne = screen.getByRole('listitem');
    expect(within(ligne).getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/tournoi/id-masters');
    expect(within(ligne).queryByRole('link', { name: 'Tableau' })).toBeNull();
    expect(within(ligne).queryByRole('link', { name: 'Picks' })).toBeNull();
    expect(within(ligne).queryByRole('link', { name: 'Résultats' })).toBeNull();
  });
});

describe('commenceDansLaSemaine', () => {
  it("vrai pour un tournoi à venir qui commence dans les 7 jours (aujourd'hui compris)", () => {
    expect(commenceDansLaSemaine(MASTERS, '2026-11-06')).toBe(true);
    expect(commenceDansLaSemaine(MASTERS, '2026-11-08')).toBe(true);
    expect(commenceDansLaSemaine(MASTERS, '2026-11-01')).toBe(true);
  });

  it("faux plus de 7 jours avant, une fois commencé, ou si le statut n'est pas « à venir »", () => {
    expect(commenceDansLaSemaine(MASTERS, '2026-10-31')).toBe(false);
    expect(commenceDansLaSemaine(MASTERS, '2026-11-09')).toBe(false);
    expect(commenceDansLaSemaine({ ...MASTERS, status: 'running' }, '2026-11-06')).toBe(false);
    expect(commenceDansLaSemaine({ ...MASTERS, start_date: null }, '2026-11-06')).toBe(false);
  });
});

describe('fraicheur', () => {
  it('« en cours » dans les 3 semaines, « périmé » au-delà, « autre » si pas en cours', () => {
    expect(fraicheur(tournoi({ status: 'running', start_date: '2026-11-02' }), '2026-11-06')).toBe('en-cours');
    expect(fraicheur(tournoi({ status: 'running', start_date: '2026-09-01' }), '2026-11-06')).toBe('perime');
    expect(fraicheur(tournoi({ status: 'completed' }), '2026-11-06')).toBe('autre');
  });
});

describe('libellePicksAPoser', () => {
  it('même texte que l\'en-tête de l\'écran Picks', () => {
    expect(libellePicksAPoser({ tour: 'QF', reste: 1 })).toBe('Tour QF : 1 pick à poser');
    expect(libellePicksAPoser({ tour: 'QF', reste: 3 })).toBe('Tour QF : 3 picks à poser');
    expect(libellePicksAPoser({ tour: 'SF', reste: 0 })).toBe('Tour SF : picks posés ✓');
  });
});

describe('CarteTournoi : picks à poser', () => {
  it('affiche la ligne quand on la fournit', () => {
    render(<CarteTournoi t={tournoi({})} debut="depuis le" aPoser={{ tour: 'QF', reste: 2 }} />);
    expect(screen.getByTestId('picks-a-poser').textContent).toBe('Tour QF : 2 picks à poser');
  });

  it('n\'affiche rien sans donnée (lecture ratée, Masters) : pas de chiffre inventé', () => {
    render(<CarteTournoi t={tournoi({})} debut="depuis le" />);
    expect(screen.queryByTestId('picks-a-poser')).toBeNull();
    cleanup();
    render(<CarteTournoi t={MASTERS} debut="début le" aPoser={null} />);
    expect(screen.queryByTestId('picks-a-poser')).toBeNull();
  });
});
