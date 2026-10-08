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

Sur un PC Windows 10 ou 11 (64 bits), dans PowerShell (menu Démarrer > « PowerShell ») :

```powershell
irm https://vibescreener.dev/install.ps1 | iex
```

Même rôle que sur Mac, sans droits administrateur : l'app s'installe pour l'utilisateur et vit dans la zone de notification (en bas à droite).

<details>
<summary>Sans PowerShell : le .exe</summary>

Télécharger [VibeScreener-Setup.exe](https://dl.vibescreener.dev/VibeScreener-Setup.exe) et l'ouvrir. L'installeur n'étant pas signé, Windows affiche « Windows a protégé votre ordinateur » : « Informations complémentaires » > « Exécuter quand même ».
</details>

## Essai et licence

14 jours d'essai gratuit, toutes les fonctions, sans carte bancaire. Ensuite, une licence achetée sur [vibescreener.dev](https://vibescreener.dev/#tarifs) (paiement par Polar) : la clé reçue par e-mail se colle dans Réglages > Licence. Sans licence, les nouvelles captures sont bloquées ; sessions, exports et Claude Code restent accessibles.

## Premier lancement

VibeScreener vit dans la barre de menus (zone de notification sous Windows) ; sur Mac, son icône n'est dans le Dock que tant qu'une fenêtre est ouverte. Un assistant en trois étapes :

1. **Autorisations** : enregistrement de l'écran (Mac seulement, puis relancer VibeScreener) et micro ; sur Mac, Accessibilité en option pour le mode vidéo (⌃⌥⌘R). Tant qu'il n'est pas terminé, l'assistant revient à chaque lancement. Les autorisations restent ensuite dans Réglages › Autorisations (macOS les oublie à chaque mise à jour, l'app n'étant pas signée).
2. **Modèle de dictée** : téléchargé tout seul (547 Mo, une seule fois). La dictée se fait ensuite sur l'ordinateur, hors ligne.
3. **Raccourci** : **⌃⌥⌘P** (Windows : **Ctrl+Alt+P**) fige l'écran ; clic sur l'élément, on parle, c'est noté. **⌘E** (**Ctrl+E**) exporte.

## Inspiration

Pour montrer à quoi un point doit ressembler : dans la bulle du point, **Inspiration**. L'éditeur s'efface ; ouvrir la page modèle (un autre site, une autre app), puis **⌃⌥⌘P** et cliquer la fenêtre ou glisser une zone. L'image rejoint le point, l'éditeur revient dessus (Échap : retour sans rien joindre). Une image peut aussi être collée (**⌘V**) ou déposée sur le point sélectionné. Les exports et Claude Code la présentent comme un modèle, pas comme l'écran à modifier.

## Tablette (iPad + Apple Pencil)

Menu de l'icône > « Appairer une tablette », scanner le QR code avec l'appareil photo de l'iPad, puis Partager > « Sur l'écran d'accueil ». Le croquis dessiné sur l'iPad rejoint le point en cours. Rien à installer d'autre, en Wi-Fi comme en 4G.

## Mode vidéo

**⌃⌥⌘R** (Windows : **Ctrl+Alt+R**) démarre et arrête, comme le bouton **Arrêter** du bandeau. Naviguez normalement : un clic seul ne laisse rien. **⌘ + clic** (Windows : **Ctrl + clic**) pose un point, puis parlez : la dictée va à ce point jusqu'au clic suivant. Tant que ⌘ est tenu, le clic n'atteint pas l'app. **⌘ + glisser** encadre une zone ; avec **⇧** en plus, le geste trace une flèche ; avec **⌥/Alt** en plus, l'image est recadrée sur le cadre. Ce qui est dit hors d'un point devient une remarque générale ; un point sans parole ni pièce jointe n'est pas gardé. Le bandeau en bas de l'écran rappelle les touches et indique où va la voix.

Le point dicté est envoyé à la tablette pendant l'enregistrement. Le bouton **Dessiner sur la tablette** permet aussi de garder un point sans dictée, puis d'y joindre un croquis. **Inspiration** suspend les clics et la dictée pendant la recherche : ouvrez la page modèle, puis utilisez le raccourci de capture ou **Capturer l’inspiration**. La capture rejoint le point d'origine et la vidéo reprend ; **Échap** dans la capture ou **Reprendre la vidéo** annule l'inspiration. À l'arrêt, tout se retrouve dans le même éditeur et les mêmes exports que les captures d'écran.

## Documents

Un PDF, un Word, un Excel ou un PowerPoint se commente comme une capture. Pour l'ouvrir : menu de l'icône > « Commenter un document… », le bouton de l'éditeur, ou un glisser-déposer sur l'éditeur. Chaque page (diapositive, feuille Excel) devient un écran : on pose des points, on dicte, et les exports pour l'IA citent le passage ou la cellule visés.

**Exporter > Copie commentée du document** écrit « rapport (commenté).docx » dans le dossier d'export, avec les commentaires au format du document :
- notes PDF avec la pastille numérotée ;
- commentaires Word sur les paragraphes ;
- commentaires PowerPoint à l'endroit du point ;
- notes Excel sur les cellules.

L'original n'est jamais modifié. Une copie du document est gardée dans la session (dossier des données de l'app).

Limites : anciens formats (.doc, .xls, .ppt) et fichiers protégés par mot de passe refusés ; graphiques des feuilles Excel non affichés ; mise en page Word parfois différente de Word (polices remplacées sans Office installé).

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
| `voir_ecran` | Un écran : capture annotée, zoom autour de chaque point, croquis, inspirations |

Port pris : les réglages le signalent ; `PASTILLE_MCP_PORT` en choisit un autre (à reporter dans la commande ci-dessus).

## Confidentialité

- Captures, sessions et dictée restent sur l'ordinateur (transcription locale par [whisper.cpp](https://github.com/ggml-org/whisper.cpp)). Le moteur par API, optionnel, envoie l'audio au service choisi.
- La tablette passe par un relais partagé (Cloudflare) qui ne voit que des messages chiffrés (AES-GCM) : la clé est dans le QR code et ne passe jamais par le serveur.
- Le serveur MCP n'écoute que sur `127.0.0.1` et refuse les requêtes venant d'un navigateur.
- Licence : la clé et un identifiant d'installation aléatoire sont envoyés à Polar pour l'activer, puis la vérifier une fois par jour. La recherche de mise à jour lit `dl.vibescreener.dev/latest.json`.

## Limites

- **Mac Apple Silicon et Windows 10/11 64 bits.** La version Windows est en test : installée et vérifiée automatiquement sur un Windows de GitHub (dictée, exports, capture), pas encore sur un vrai PC. Dictée plus lente sur PC que sur Mac (pas d'accélération GPU) ; sur un PC ARM, l'app tourne en émulation x64.
- **Installeur Windows non signé** : SmartScreen avertit si le .exe est téléchargé par le navigateur (la commande PowerShell l'évite).
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
| `pnpm dist` | Installeur de la plateforme courante (`apps/desktop/dist/` ; Windows : `pnpm setup:whisper` avant, pour embarquer whisper-server) |

Le menu de l'icône garde une entrée « Mesures (POC) » pour remesurer la capture et la dictée.

### Publier une version

Monter la version dans `apps/desktop/package.json`, puis `git tag vX.Y.Z && git push --tags` : la CI construit le .dmg et le .exe, installe et teste l'app sur Windows, puis envoie les installeurs sur le bucket R2 `vibescreener-downloads` (`dl.vibescreener.dev`), avec `install.sh`, `install.ps1` et, en dernier, `latest.json`, que les apps installées lisent pour proposer la mise à jour. Elle crée aussi une Release GitHub, que lisent encore les apps ≤ 0.7.0 (le temps qu'elles passent à une version qui lit R2). Sans tag, « Run workflow » avec « Construire les installeurs » fait tout sauf la publication (installeurs dans les artefacts du run).

### Cloudflare

Tout est sur le compte Cloudflare du projet (domaine provisoire `vibescreener.dev`) :

| Adresse | Quoi | Déploiement |
| --- | --- | --- |
| `vibescreener.dev` | Site (`apps/site`, statique) | `pnpm site:deploy` |
| `relay.vibescreener.dev` | Relais + PWA de la tablette (`apps/relay`). Le même Worker répond sur `pastille.vibescreener.workers.dev` pour les apps et tablettes appairées avant : ne pas retirer. | `pnpm relay:deploy` |
| `dl.vibescreener.dev` | Bucket R2 public `vibescreener-downloads` : .dmg, .exe, `install.sh`, `install.ps1`, `latest.json` | CI, au tag |

La CI déploie le relais et le site à chaque push sur `main`, et publie sur R2 au tag, dès que le dépôt a le secret `CLOUDFLARE_API_TOKEN` (jeton limité : Workers, R2, routes du domaine) et la variable `CLOUDFLARE_ACCOUNT_ID`. À la main : `pnpm --filter @pastille/relay exec wrangler login`.

## Licence

Tous droits réservés (voir [LICENSE](LICENSE)). Licence d'utilisation : [vibescreener.dev/licence](https://vibescreener.dev/licence).
