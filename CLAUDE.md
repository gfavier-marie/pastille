# Pastille

Outil de revue d'interface : raccourci → capture → points numérotés dictés → export pour l'IA. Spécification : `docs/SPEC.md`. Avancement : `ROADMAP.md`.

**Règle n°1 : le plus simple possible.** Respecter [M]/[S]/[C] ; toute fonction non listée est proposée, jamais ajoutée. Pas de nouvelle dépendance sans raison.

## Stack

- Monorepo pnpm (`nodeLinker: hoisted`), TypeScript strict, Node ≥ 22.18 (exécute le TS directement).
- `apps/relay` : Worker Cloudflare + Durable Object (une room par appairage), sert aussi la PWA (`apps/pwa/dist`).
- `apps/desktop` : Electron + electron-vite + React. Toute la logique dans le processus principal (`src/main`), les fenêtres affichent et parlent par IPC typé (`src/ipc.ts`, exposé par `src/preload`).
- `packages/shared` : types, protocole, chiffrement, rendu des annotations (`drawAnnotations`, Canvas 2D, seule fonction de rendu).
- Transcription : `whisper-server` (whisper.cpp) en processus enfant, modèle `models/ggml-large-v3-turbo-q5_0.bin`.

## Commandes

- `pnpm install` puis `pnpm setup:whisper` : modèle + binaire whisper (Windows : téléchargé dans `vendor/`, macOS : `brew install whisper-cpp`).
- `pnpm dev` : lance l'app desktop.
- `pnpm bench:dictee` : mesure de transcription sur `apps/desktop/fixtures/dictee-fr.wav`.
- `pnpm relay` (relais + PWA en local, port 8787) et `pnpm bench:synchro [url]` (QR d'appairage + aller-retour). L'app desktop vise `PASTILLE_RELAY` (défaut `http://localhost:8787`).
- `pnpm test`, `pnpm typecheck`, `pnpm e2e` (session factice → photo de l'éditeur + exports, dans `e2e-output/`).
- Fenêtre de mesures du lot 0 : `PASTILLE_POC=1 pnpm dev`.
- Mesure de capture sans interaction : `pnpm --filter @pastille/desktop build && PASTILLE_AUTOTEST=capture npx electron apps/desktop` (5 captures, clic simulé au centre).

## Conventions

- Interface et commentaires en français ; textes d'interface regroupés pour une traduction future.
- Imports relatifs avec extension `.ts` ; syntaxe TS effaçable uniquement (pas d'enum, pas de propriétés de paramètre).
- Fenêtres de l'app : `setContentProtection(true)` et masquées pendant une capture.
- Signaler toute limite de plateforme (capture, autorisations, raccourci pris) au lieu de la contourner en silence.
