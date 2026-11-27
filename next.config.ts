import type { NextConfig } from "next";

// L'application est entièrement temps réel côté client (télé + téléphones) :
// pas de pré-rendu « Cache Components », les pages de partie sont rendues à la demande.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
