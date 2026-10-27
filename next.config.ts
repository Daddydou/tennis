import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deux lockfiles coexistent (~/package-lock.json et celui du projet) : on
  // fixe la racine Turbopack sur le projet pour lever l'avertissement.
  turbopack: {
    root: __dirname,
  },
  // Anciens onglets du tournoi (liens et favoris) : redirigés AVANT le rendu,
  // paramètres d'URL conservés (participant, round, moitie). Les pages
  // plan/ et bracket/ redirigent aussi, en filet de sécurité.
  async redirects() {
    return [
      { source: '/tournoi/:id/plan', destination: '/tournoi/:id/picks', permanent: false },
      { source: '/tournoi/:id/bracket', destination: '/tournoi/:id/predictions?vue=tableau', permanent: false },
    ];
  },
};

export default nextConfig;
