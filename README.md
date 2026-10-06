# Pastille

Revue d'interface par captures annotées, dictée et croquis, exportée pour l'IA. Un raccourci fige l'écran, un clic pose un point numéroté et lance la dictée, une tablette ajoute un croquis, puis on exporte en PDF, en Markdown ou en PowerPoint. Voir [docs/SPEC.md](docs/SPEC.md) et [ROADMAP.md](ROADMAP.md).

## Utiliser l'app

1. Installer : `Pastille-…-arm64.dmg` sur Mac, `Pastille Setup ….exe` sur Windows. Les installeurs sont produits par `pnpm dist`, ou par la CI (action « CI », option « Construire les installeurs »).
2. Au premier lancement, la fenêtre « Réglages » guide les premiers pas :
    - **macOS** : autoriser l'**enregistrement de l'écran** (Réglages Système > Confidentialité et sécurité), puis relancer Pastille. L'app n'étant pas signée, la première ouverture se fait par clic droit > Ouvrir.
    - **Micro** : autoriser quand le système le demande (Windows : Paramètres > Confidentialité > Microphone).
    - **Modèle Whisper** : bouton « Télécharger » (547 Mo, une seule fois, depuis Hugging Face).
3. Sur l'écran à relire : **⌘⇧2** (Mac) ou **Ctrl+Shift+2** (Windows), puis clic sur l'élément et dictée. **⌘E** / **Ctrl+E** exporte le PDF.

Pastille vit dans la barre de menus (Mac) ou la zone de notification (Windows). Son menu donne accès aux exports, aux sessions récentes, à l'appairage de la tablette et aux réglages.

## Développer

Prérequis : Node 22.18 ou plus récent, pnpm (`corepack enable`), git.

```bash
pnpm install
pnpm setup:whisper   # modèle Whisper + whisper-server (Mac : brew install whisper-cpp avant ; Windows : téléchargé)
pnpm dev             # lance l'app (depuis ton propre Terminal sur Mac, pour l'autorisation d'enregistrement d'écran)
```

| Commande | Rôle |
| --- | --- |
| `pnpm test`, `pnpm typecheck` | Tests unitaires et vérification des types |
| `pnpm e2e` | Session factice, dictée par un faux micro, photo de l'éditeur et des réglages, exports PDF, Markdown et PowerPoint (`e2e-output/`) |
| `pnpm bench:dictee` | Temps de transcription de 5 s de français |
| `pnpm relay` | Relais + PWA de la tablette en local (http://localhost:8787) |
| `pnpm bench:synchro [url]` | QR d'appairage et aller-retour chiffré desktop ↔ tablette |
| `pnpm build:whisper-mac` | whisper-server autonome (statique, Metal) pour l'installeur Mac ; nécessite cmake |
| `pnpm dist` | Installeur de la plateforme courante (`apps/desktop/dist/`) |

Le menu de l'icône garde une entrée « Mesures (POC) » pour remesurer la capture et la dictée.

## Tablette : déployer le relais

Le relais (Worker Cloudflare + Durable Object) sert aussi la PWA de croquis. Un compte Cloudflare gratuit suffit.

```bash
pnpm --filter @pastille/relay exec wrangler login
pnpm relay:deploy
```

Lancer ensuite Pastille avec l'adresse du Worker, par exemple `PASTILLE_RELAY=https://pastille.<sous-domaine>.workers.dev pnpm dev`. Dans le menu de l'icône, « Appairer une tablette » affiche le QR code. Sur l'iPad, ouvrir le lien puis « Ajouter à l'écran d'accueil ».

Le relais ne voit que des messages chiffrés (AES-GCM, clé transmise dans le QR, jamais envoyée au serveur).
