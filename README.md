# VibeScreener

Revue d'interface par captures annotées, dictée et croquis, exportée pour l'IA. Un raccourci fige l'écran, un clic pose un point numéroté et lance la dictée, une tablette ajoute un croquis, puis on exporte en PDF, en Markdown ou en PowerPoint, ou Claude Code lit la revue directement.

![L'éditeur de VibeScreener : capture annotée de points numérotés, commentaires dictés et croquis](docs/editeur.png)

## Installer

Sur un Mac Apple Silicon (M1 ou plus récent, macOS 13 ou plus), dans le Terminal :

```bash
curl -fsSL https://vibescreener.dev/install.sh | sh
```

La commande installe VibeScreener dans Applications, la branche à Claude Code s'il est installé, puis la lance. Elle sert aussi aux mises à jour.

<details>
<summary>Sans Terminal : le .dmg</summary>

Télécharger [VibeScreener-arm64.dmg](https://dl.vibescreener.dev/VibeScreener-arm64.dmg) et glisser VibeScreener dans Applications. L'app n'étant pas signée par Apple, la première ouverture est bloquée : Réglages Système > Confidentialité et sécurité > « Ouvrir quand même ».
</details>

## Essai et licence

14 jours d'essai gratuit, toutes les fonctions, sans carte bancaire. Ensuite, une licence achetée sur [vibescreener.dev](https://vibescreener.dev/#tarifs) (paiement par Polar) : la clé reçue par e-mail se colle dans Réglages > Licence. Sans licence, les nouvelles captures sont bloquées ; sessions, exports et Claude Code restent accessibles.

## Premier lancement

VibeScreener vit dans la barre de menus. Un assistant en trois étapes :

1. **Autorisations** : enregistrement de l'écran (puis relancer VibeScreener) et micro.
2. **Modèle de dictée** : téléchargé tout seul (547 Mo, une seule fois). La dictée se fait ensuite sur le Mac, hors ligne.
3. **Raccourci** : **⇧⌘2** fige l'écran ; clic sur l'élément, on parle, c'est noté. **⌘E** exporte.

## Tablette (iPad + Apple Pencil)

Menu de l'icône > « Appairer une tablette », scanner le QR code avec l'appareil photo de l'iPad, puis Partager > « Sur l'écran d'accueil ». Le croquis dessiné sur l'iPad rejoint le point en cours. Rien à installer d'autre, en Wi-Fi comme en 4G.

## Claude Code

L'installeur ajoute le serveur MCP de VibeScreener à Claude Code. Sinon, une fois (la commande est aussi dans les réglages, onglet « Export PDF ») :

```bash
claude mcp add --transport http --scope user vibescreener http://127.0.0.1:3917/mcp
```

VibeScreener doit être lancée. Il suffit ensuite de demander à Claude Code, dans le projet concerné, « applique la revue VibeScreener ». Trois outils, en lecture seule :

| Outil | Rôle |
| --- | --- |
| `lister_sessions` | Les 20 sessions récentes, avec leur id ; la session ouverte est signalée |
| `lire_revue` | Tous les retours d'une session en texte (la session ouverte par défaut) |
| `voir_ecran` | Un écran : capture annotée, zoom autour de chaque point, croquis |

Port pris : les réglages le signalent ; `PASTILLE_MCP_PORT` en choisit un autre (à reporter dans la commande ci-dessus).

## Confidentialité

- Captures, sessions et dictée restent sur le Mac (transcription locale par [whisper.cpp](https://github.com/ggml-org/whisper.cpp)). Le moteur par API, optionnel, envoie l'audio au service choisi.
- La tablette passe par un relais partagé (Cloudflare) qui ne voit que des messages chiffrés (AES-GCM) : la clé est dans le QR code et ne passe jamais par le serveur.
- Le serveur MCP n'écoute que sur `127.0.0.1` et refuse les requêtes venant d'un navigateur.
- Licence : la clé et un identifiant d'installation aléatoire sont envoyés à Polar pour l'activer, puis la vérifier une fois par jour. La recherche de mise à jour lit `dl.vibescreener.dev/latest.json`.

## Limites

- **Mac Apple Silicon uniquement** pour l'instant. Windows est prévu : le code est multiplateforme, mais rien n'a encore été testé sur un vrai PC.
- **Pas de signature Apple** : après chaque mise à jour, macOS redemande les autorisations écran et micro.

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
| `pnpm e2e` | Session factice, dictée par un faux micro, photo de l'éditeur et des réglages, exports PDF, Markdown et PowerPoint, lecture d'un écran par le serveur MCP (`e2e-output/`) |
| `pnpm bench:dictee` | Temps de transcription de 5 s de français |
| `pnpm relay` | Relais + PWA de la tablette en local (http://localhost:8787), visé par `pnpm dev` |
| `pnpm site` | Site public (landing, tarifs, pages légales) en local, servi comme sur Cloudflare |
| `pnpm bench:synchro [url]` | QR d'appairage et aller-retour chiffré desktop ↔ tablette |
| `pnpm build:whisper-mac` | whisper-server autonome (statique, Metal) pour l'installeur Mac ; nécessite cmake |
| `pnpm dist` | Installeur de la plateforme courante (`apps/desktop/dist/`) |

Le menu de l'icône garde une entrée « Mesures (POC) » pour remesurer la capture et la dictée.

### Publier une version

Monter la version dans `apps/desktop/package.json`, puis `git tag vX.Y.Z && git push --tags` : la CI construit le .dmg et l'envoie sur le bucket R2 `vibescreener-downloads` (`dl.vibescreener.dev`), avec `install.sh` et, en dernier, `latest.json`, que les apps installées lisent pour proposer la mise à jour.

### Cloudflare

Tout est sur le compte Cloudflare du projet (domaine provisoire `vibescreener.dev`) :

| Adresse | Quoi | Déploiement |
| --- | --- | --- |
| `vibescreener.dev` | Site (`apps/site`, statique) | `pnpm site:deploy` |
| `relay.vibescreener.dev` | Relais + PWA de la tablette (`apps/relay`). Le même Worker répond sur `pastille.vibescreener.workers.dev` pour les apps et tablettes appairées avant : ne pas retirer. | `pnpm relay:deploy` |
| `dl.vibescreener.dev` | Bucket R2 public `vibescreener-downloads` : .dmg, `install.sh`, `latest.json` | CI, au tag |

La CI déploie le relais et le site à chaque push sur `main`, et publie sur R2 au tag, dès que le dépôt a le secret `CLOUDFLARE_API_TOKEN` (jeton limité : Workers, R2, routes du domaine) et la variable `CLOUDFLARE_ACCOUNT_ID`. À la main : `pnpm --filter @pastille/relay exec wrangler login`.

## Licence

Tous droits réservés (voir [LICENSE](LICENSE)). Licence d'utilisation : [vibescreener.dev/licence](https://vibescreener.dev/licence).
