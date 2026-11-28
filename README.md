# 🎵 Blind Test Party

Le blind test musical des soirées entre potes : **la télé joue la musique et affiche le jeu, les téléphones servent de buzzer.**

- Écran télé : lobby avec QR code, compte à rebours, chrono néon, révélation avec pochette, podium, statistiques de fin.
- Téléphones : rejoindre avec un code ou un QR code, pseudo + avatar, saisie libre (fautes de frappe tolérées) ou choix multiples.
- Joker 💡 : en saisie libre, un joueur qui sèche peut afficher 4 propositions (une tentative, points divisés par deux).
- Télécommande 🎛️ : l'animateur pilote la partie depuis son téléphone (pause, passer, son, exclure, terminer, rejouer) et peut **accorder** une réponse refusée par la reconnaissance automatique.
- 15 catégories prêtes à jouer (~300 titres) + playlists perso (recherche Deezer ou import de vos propres fichiers).

## Stack

| Couche | Choix |
| --- | --- |
| Front | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Motion (Framer Motion) |
| Back | Routes API Next.js (serveur qui fait autorité) + Supabase (Postgres, Realtime, Storage) |
| Audio | HTML5 Audio, fournisseurs modulaires : Deezer (extraits officiels 30 s), fichiers importés |
| Hébergement | Vercel + Supabase |

### Architecture en bref

- **Le serveur décide de tout** : phases de jeu, validation des réponses, calcul des points. Toutes les écritures passent par les routes `/api/*` avec la clé `service_role` côté serveur.
- **Le navigateur ne fait que lire** l'état public (`rooms`, `players`) via Supabase Realtime. Les réponses attendues (`room_tracks`), les réponses des joueurs (`answers`) et les jetons sont inaccessibles avec la clé publique (RLS). Les joueurs ne voient jamais les réponses des autres avant la révélation.
- **Seule la télé joue le son** : pas de synchronisation audio entre téléphones. Les chronos sont synchronisés grâce à une estimation du décalage d'horloge avec le serveur.
- **Reconnexion** : chaque téléphone garde son jeton ; recharger la page ou perdre le Wi-Fi ne fait pas perdre sa place. Si Realtime est coupé, l'appli bascule sur une relecture toutes les 2 s.
- **Fournisseurs audio** (`src/lib/audio/`) : une interface `AudioProvider` (`search`, `resolvePlayable`). Ajouter Spotify, YouTube ou autre = un fichier de plus, sans toucher au moteur.

```
src/
  app/                 pages (/, /create, /tv/[code], /join, /play/[code], /library) + routes API
  components/          design system néon (logo, égaliseur, classement, podium, chrono…)
  lib/
    match.ts           reconnaissance des réponses (accents, casse, fautes, alias)
    catalog.ts         les 15 catégories et leurs titres
    game.ts            types et règles partagés
    audio/             fournisseurs audio (Deezer, fichiers)
    server/engine.ts   moteur de partie (phases, score, pause, rejouer…)
    client/            appels API, temps réel, stockage local
supabase/migrations/   schéma SQL (tables, RLS, Realtime, bucket de stockage)
```

## Mise en ligne (Supabase + Vercel)

### 1. Supabase

1. Ouvre ton projet Supabase → **SQL Editor** → **New query**.
2. Colle le contenu de `supabase/migrations/20261127000000_init.sql` et clique sur **Run**.
   (Ça crée les tables, la sécurité RLS, active le temps réel sur `rooms`/`players` et crée le bucket de stockage `library`.)
3. Dans **Project Settings → API**, récupère :
   - l'URL du projet,
   - la clé **publique** (`anon` ou `publishable`),
   - la clé **secrète** (`service_role` ou `secret`) — ne la mets jamais dans le code ni côté navigateur.

> Alternative en ligne de commande : `npx supabase link --project-ref <ref>` puis `npx supabase db push`.

### 2. Vercel

1. **Add New → Project** et importe le dépôt GitHub.
2. Variables d'environnement :

   | Nom | Valeur |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé publique (anon / publishable) |
   | `SUPABASE_SERVICE_ROLE_KEY` | clé secrète (service_role / secret) |
   | `LIBRARY_PASSWORD` | *(optionnel)* mot de passe pour protéger la page « Ma bibliothèque » |

3. **Deploy**. C'est tout.

## Jouer

1. Sur la télé (ou un ordinateur branché dessus) : **Créer une partie** → choisis les catégories et les réglages → **Créer la salle**.
2. Chacun scanne le QR code (ou va sur `/join` et tape le code à 6 caractères).
3. Sur la télé : **Lancer la partie** (ce clic autorise aussi le son).
4. Raccourcis télé : `Espace` pause/reprise · `→` passer · `M` couper le son · `F` plein écran.
5. Télécommande : dans le lobby, « 🎛️ Piloter depuis mon téléphone » affiche un QR code à scanner avec **votre** téléphone (ne le montrez pas aux joueurs : il donne les commandes). Le jeton passe dans le fragment de l'URL (`#k=…`), jamais envoyé au serveur dans les journaux.

## Développement local

```bash
npm install
npx supabase start          # Supabase local (Docker)
cp .env.example .env.local  # puis renseigne les clés affichées par supabase start
npm run dev
```

Tests :

```bash
npm test                    # reconnaissance des réponses
npm run check:catalog       # vérifie que chaque titre du catalogue a un extrait Deezer
npx tsx scripts/smoke.ts    # joue une partie complète contre le serveur lancé (sécurité, score, pause, rejouer…)
```

## Et Spotify ?

L'API Spotify ne fournit plus d'extraits de 30 s aux nouvelles applications. Avec un compte **Premium**, on peut en revanche utiliser le **Web Playback SDK** sur la télé : morceaux complets, démarrage à la seconde de votre choix. C'est prévu comme fournisseur supplémentaire (connexion Spotify de l'animateur sur l'écran télé), sans changer le reste de l'application.

## Feuille de route

- **V2** : modes Rapidité, Équipes, Survie ; fournisseur Spotify (Premium) ; animations de changement de classement plus poussées.
- **V3** : télécommande de l'animateur sur téléphone, éditeur de manches, gestion fine des points.
