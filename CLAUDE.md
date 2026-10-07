# VibeScreener

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
- `pnpm relay` (relais + PWA en local, port 8787) et `pnpm bench:synchro [url]` (QR d'appairage + aller-retour). L'app desktop vise `PASTILLE_RELAY`, sinon `http://localhost:8787` en développement et le relais partagé `https://relay.vibescreener.dev` une fois installée (`pnpm relay:deploy` le met à jour ; le même Worker répond aussi sur `https://pastille.vibescreener.workers.dev`, à garder pour les apps et tablettes appairées avant).
- `pnpm site` / `pnpm site:deploy` : site public statique (`apps/site`, landing, tarifs, pages légales) en cinq langues : modèles `src/*.html` aux textes `{{groupe.clé}}` tirés de `src/i18n/`, produits dans `dist/` par `build.ts` (français à la racine, `/en/`, `/es/`, `/de/`, `/it/`).
- Licence (`src/main/license.ts`) : essai de `TRIAL_DAYS` jours, puis clé Polar activée et vérifiée par l'API publique de Polar ; seules les nouvelles captures sont bloquées sans licence. Essais : `PASTILLE_TRIAL_DAYS=0`, `PASTILLE_POLAR=sandbox`. Domaine provisoire `vibescreener.dev` (à remplacer partout une fois acheté).
- `pnpm test`, `pnpm typecheck`, `pnpm e2e` (session factice → photo de l'éditeur + exports, dans `e2e-output/`).
- Fenêtre de mesures du lot 0 : `PASTILLE_POC=1 pnpm dev`.
- Claude Code : `claude mcp add --transport http --scope user vibescreener http://127.0.0.1:3917/mcp` (serveur MCP de l'app, `src/main/mcp.ts`, VibeScreener lancée).
- Publication : un tag `v*` poussé (même numéro que `version` dans `apps/desktop/package.json`, vérifié par la CI) fait construire le .dmg et le .exe, installer et tester l'app sur Windows, puis envoyer les installeurs sur le bucket R2 `dl.vibescreener.dev` avec `install.sh`, `install.ps1` et `latest.json`, que l'app installée compare à sa version pour proposer la mise à jour (`src/main/updater.ts`) ; une Release GitHub est aussi créée pour les apps ≤ 0.7.0, qui la lisent encore. Installation : `curl -fsSL https://vibescreener.dev/install.sh | sh` (Mac), `irm https://vibescreener.dev/install.ps1 | iex` (Windows). Installeur Mac signé ad hoc (pas de compte Apple), installeur Windows non signé.
- Mesure de capture sans interaction : `pnpm --filter @pastille/desktop build && PASTILLE_AUTOTEST=capture npx electron apps/desktop` (5 captures, clic simulé au centre).

## Conventions

- Interface en cinq langues (fr, en, es, de, it ; anglais si la langue du système n'est pas traduite) : textes de l'app dans `apps/desktop/src/texts/` (fenêtres, processus principal, exports, MCP ; `T` lu au moment de l'appel), de la PWA dans `apps/pwa/src/texts.ts`, du site dans `apps/site/src/i18n/`. Toute nouvelle chaîne s'ajoute dans les cinq langues (le typecheck vérifie les clés, un test repère les textes restés en français). `PASTILLE_LANG=xx` force la langue de l'app. Commentaires du code en français.
- Imports relatifs avec extension `.ts` ; syntaxe TS effaçable uniquement (pas d'enum, pas de propriétés de paramètre).
- Fenêtres de l'app : `setContentProtection(true)` et masquées pendant une capture.
- Signaler toute limite de plateforme (capture, autorisations, raccourci pris) au lieu de la contourner en silence.
