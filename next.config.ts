import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deux lockfiles coexistent (~/package-lock.json et celui du projet) : on
  // fixe la racine Turbopack sur le projet pour lever l'avertissement.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
