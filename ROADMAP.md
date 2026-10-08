# VibeScreener — roadmap

Six étapes, chacune utilisable en vrai dès sa livraison. On ne passe à la suivante qu'après validation de son critère, mesuré sur Mac. **Pas de PC Windows pour l'instant** : le code reste multiplateforme ; la CI GitHub le compile, installe l'app sur un Windows et la teste (dictée, exports, capture). La validation sur un vrai PC attendra. Cahier des charges : [docs/SPEC.md](docs/SPEC.md).

**Simplicité d'abord** : on fait les [M], les [S] placés ci-dessous, aucun [C], rien hors cahier des charges sauf l'export PowerPoint demandé.

## Exports

| Format | Pour qui | Lot |
| --- | --- | --- |
| PDF | IA en chat (Claude.ai, ChatGPT) | 1 |
| Dossier Markdown + images (`revue.md` + `images/`) | IA qui lit des fichiers (Claude Code, Cursor) | 1 |
| PowerPoint (.pptx) | Présenter la revue à des humains | 4 |

Un seul moteur : `buildExport()` produit une fois les images (captures annotées, zooms, croquis), puis `toPdf()`, `toMarkdown()` et `toPptx()` les mettent en forme.

## Étape 0 — Mise en place ✅

- [x] Monorepo pnpm : `apps/desktop`, `apps/pwa`, `apps/relay`, `packages/shared`
- [x] Dépôt privé GitHub + CI Windows et macOS
- [x] `docs/SPEC.md`, `CLAUDE.md`, `ROADMAP.md`

## Lot 0 — Trois POC

- [ ] **Capture** : raccourci global, overlay figé par écran, fenêtre sous le curseur (get-windows), recadrage en résolution physique.
  *Critère : fenêtre Chrome capturée en 1 raccourci + 1 clic, pleine résolution, sans fenêtre de Pastille. Overlay < 200 ms.*
    - [ ] Mac (code prêt, en attente de l'autorisation d'enregistrement d'écran)
    - [ ] PC (quand un PC sera disponible)
- [ ] **Dictée** : micro → PCM 16 kHz (AudioWorklet) → whisper-server, modèle large-v3-turbo q5_0.
  *Critère : 5 s de français en < 2 s (Mac) et < 5 s (PC), « border-radius », « padding », « header » corrects.*
    - [x] Mac, échantillon de 5,3 s : **0,6 s** avec contexte audio réduit (1,1 s sans), vocabulaire 3/3 (M1 Pro, 6 oct. 2026)
    - [ ] Mac, au micro
    - [ ] Windows : runner GitHub (2 vCPU partagés, 8 Go, sans GPU) **38 s** (71 s sans contexte réduit), vocabulaire 3/3. Bien plus faible qu'un vrai PC, mais **risque réel** : à mesurer sur un PC récent ; sinon moteur API en secours (prévu au lot 4) ou modèle plus léger.
- [ ] **Synchro** : Worker Cloudflare + Durable Object, PWA minimale, AES-GCM.
  *Critère : aller-retour chiffré desktop → iPad → desktop < 300 ms, en Wi-Fi et en 4G.*
    - [x] En local (wrangler dev + navigateur) : **3 ms**, reconnexion après rechargement OK
    - [ ] Relais déployé + iPad, Wi-Fi et 4G
    - Simplification : le même Worker sert la PWA et le WebSocket (un seul déploiement au lieu de Worker + Pages).

## Lot 1 — Boucle de base au clavier + exports PDF et Markdown

- [x] Sessions : création auto, nom par défaut, renommage, champ Contexte [S], sauvegarde atomique (anti-rebond 300 ms), réouverture après crash
- [x] Icône et menu (§4.7) ; overlay : clic (fenêtre + point n°1), zone, écran entier
- [x] Éditeur : zoom/déplacement, points glissables, bulle de saisie, numérotation #1 à #N, liste et vignettes, raccourcis de base (Tab, Suppr, Page préc./suiv., ⌘E)
- [x] `buildExport` + PDF + Markdown ; test de bout en bout `pnpm e2e` (session factice, photo de l'éditeur, PDF de 17 pages pour 20 points)
- [ ] Validation réelle sur Mac : 20 points sur 5 captures en < 3 min, puis PDF et Markdown donnés à Claude

*Critère : 20 points sur 5 captures en < 3 min au clavier ; avec le PDF comme avec le Markdown, Claude restitue les 20 retours sans erreur.*

## Lot 2 — Dictée et vitesse

- [x] Dictée automatique (arrêt au point suivant, Entrée, silence de 3 s, 60 s max), Échap, bascule clavier, re-dictée ⌘M ; micro préparé dès le raccourci, 200 ms gardées avant le clic
- [x] File de transcription persistée (reprise au redémarrage), « Réessayer », avertissement avant export
- [x] Clic overlay = capture de fenêtre + point n°1 ; encadré au survol [S] ; ⇧+clic dernière zone [S] ; app et titre de fenêtre [S]
- [x] Zones (glisser) et flèches (⇧ + glisser) [S], raccourcis du §4.6, annuler/rétablir (⌘Z / ⌘⇧Z, Ctrl+Y)
- [x] `pnpm e2e` : un faux micro joue l'échantillon, la dictée est transcrite et ajoutée au point
- [x] Dictée en boucle (vue par le test Windows, possible aussi sur Mac) : avec le contexte audio réduit, Whisper répétait parfois la fin ; un texte trop long pour la durée est refait avec le contexte complet
- [ ] Validation réelle sur Mac : 30 retours dictés en < 5 min, un clic par retour

*Critère : 30 retours dictés en < 5 min, un clic par retour, aucune attente perçue.*

## Lot 3 — Tablette (iPad + Apple Pencil)

- [x] Relais, appairage QR mémorisé (menu de l'icône), reconnexion avec renvoi du point actif, présence (voyant dans l'éditeur)
- [x] PWA installable (manifeste + petit service worker, sans Workbox) : bandeau « Point #N », toile, gros boutons, Envoyer, « Joint au point #N »
- [x] Pression du stylet, rejet de la paume, tap à deux doigts [S], fonds quadrillé et recadrage [S], plusieurs croquis par point [S] ; croquis agrandissables et supprimables dans l'éditeur, repris dans les exports
- [x] Testé en local : `PASTILLE_AUTOTEST=tablet` + relais local + navigateur en guise de tablette → croquis reçu sur le point #1
- [ ] Déploiement Cloudflare (`wrangler login` par toi), puis test sur iPad + Pencil en Wi-Fi et 4G

*Critère : croquis visible sur le desktop < 500 ms après « Envoyer » ; reconnexion après mise en veille.*

## Lot 4 — Finition + PowerPoint

- [x] Premiers pas dans les réglages : autorisations écran et micro, téléchargement du modèle avec progression
- [x] Réglages complets : raccourci (vérifié), mode de commentaire (auto, ⌥ maintenu, clavier seul), silence, langue, dossier d'export, instructions du PDF, glossaire, moteur API compatible OpenAI (clé chiffrée), révocation de la tablette
- [x] Découpage du PDF (> 100 pages ou 30 Mo), **export PowerPoint**, copie du PDF dans le presse-papiers [S] (à vérifier en vrai)
- [x] Sessions récentes [S], icône d'état [S] (nombre de points, transcriptions en cours)
- [x] Toutes les sessions (hors cahier des charges, demandé) : liste dans l'éditeur (« Sessions » dans l'en-tête, « Toutes les sessions… » dans le menu de l'icône) pour ouvrir, réexporter le PDF ou mettre à la corbeille
- [x] Suppression d'un écran (hors cahier des charges, demandé) : croix sur la vignette, avec ses points, annulable (⌘Z)
- [x] Relancer la dictée d'un point (demandé) : bouton micro dans la bulle et dans la liste des points, le texte s'ajoute à la fin ; « ⌘M dicte la suite » affiché dans la bulle
- [x] Inspiration d'un point (hors cahier des charges, demandé) : bouton dans la bulle, l'éditeur s'efface, la capture suivante (⌃⌥⌘P) est jointe au point au lieu de créer un écran ; aussi par ⌘V ou glisser-déposer d'une image ; reprise dans les trois exports et le MCP comme « modèle du résultat souhaité »
- [ ] Inspiration : essai réel de la capture (l'autotest n'a pas l'autorisation d'enregistrement d'écran ; chaîne vérifiée avec une image factice)
- [x] Assistant de premier lancement rouvert au démarrage tant qu'une autorisation manque (après une mise à jour, macOS les oublie) ; le micro n'est plus demandé avant l'assistant ; non bloquant, chaque fonction signale ce qui manque
- [x] Remarques générales (hors cahier des charges, demandé) : liste de commentaires non rattachés à un point, tapés ou dictés, annulables (⌘Z), repris dans les trois exports et le MCP
- [x] Mise à jour depuis le menu de l'icône (demandé) : la dernière Release GitHub est proposée, install.sh la pose et relance l'app ; macOS redemande les autorisations (app non signée)
- [x] Nom de l’app : VibeScreener (identifiants internes inchangés : `@pastille/*`, `PASTILLE_*`, `pastille://`, appId) ; PDF avec logo
- [x] Installeur .dmg (arm64, non signé, 147 Mo) avec whisper-server autonome ; testé empaqueté (`PASTILLE_AUTOTEST=editor`)
- [x] Windows publié (demandé) : `VibeScreener-Setup.exe` dans la Release, installation en une commande PowerShell (`install.ps1`, sans SmartScreen ni droits administrateur), runtime Visual C++ embarqué pour whisper-server, mise à jour depuis le menu de l'icône ; la CI installe l'app sur un Windows et la teste (e2e + 5 captures réelles)
- [ ] Essai sur un vrai PC (ou une VM Windows 11 sur le Mac) : installation, raccourci Ctrl+Alt+P (vérifier qu'AltGr+P ne le déclenche pas en AZERTY), overlay, dictée au micro, menu de la zone de notification, mise à jour
- [ ] Mac Intel (x86_64), signature et notarisation : si un compte Apple Developer est disponible
- [x] Dépôt public : installation en une commande (`install.sh`, branche aussi Claude Code), installeur signé ad hoc, relais partagé visé par l'app installée, Release publiée par tag, licence MIT

*Critère : installation sur une machine vierge, Mac et PC, en < 5 min modèle compris.*

## Design

Maquette : [canvas « Pastille — design »](https://claude.ai/artifact/UDWBtfFPfoVjpYJ1PQbEDk) (13 écrans).

- [x] Pastilles en goutte, couleur #D63A0C (éditeur, exports, PWA) ; thème et icônes communs, textes regroupés (`renderer/texts.ts`)
- [x] Overlay (assombrissement, étiquette app + taille, pastille fantôme), éditeur sombre (bulle avec onde, panneau, vignettes, zoom)
- [x] Menu en popover sous l'icône ; réglages en onglets ; assistant de premier lancement en 3 étapes ; fenêtre d'appairage ; PWA restylée
- [x] Hors cahier des charges, validés le 6 oct. 2026 : **barre flottante** (option), **ouverture au démarrage**, **icône d'état dynamique** (dictée, transcriptions, erreur)
- [x] `pnpm e2e` photographie aussi le menu, la barre, l'overlay, l'assistant, l'appairage et la liste des sessions
- [x] Menu ≡ dans l'éditeur (demandé le 7 oct. 2026) : toutes les entrées du menu de l'icône, en haut à droite de l'en-tête et de l'éditeur vide ; un seul composant pour le popover et l'éditeur (`renderer/menu/items.tsx`) ; photo `editor-menu.png` dans `pnpm e2e`
- [x] Overlay en panneau macOS : Échap et premier clic marchent sans que l'app soit au premier plan (macOS 14+)
- [ ] Validation réelle sur Mac : popover sous l'icône, barre flottante au survol, ouverture au démarrage
- [x] Raccourci par défaut : sur le Mac de test, ⇧⌘2 (et ⇧⌘0) n'arrivent jamais à Pastille, interceptés par une autre app ; ⌃⌥⌘P marche. L'enregistrement « réussit » quand même, donc rien n'est signalé. Nouveau défaut ⌃⌥⌘P (Windows : Ctrl+Alt+P), l'ancien défaut enregistré est remplacé, un raccourci choisi est gardé

## Hors lot — Serveur MCP pour Claude Code [C], demandé

- [x] Serveur MCP local dans l'app (HTTP sur 127.0.0.1:3917, lecture seule) : `lister_sessions`, `lire_revue`, `voir_ecran` ; commande `claude mcp add` dans les réglages ; testé par `pnpm e2e`
- [x] Branchement facile à trouver : onglet « Claude Code » dans les réglages (commande à copier, dernière connexion), « Brancher Claude Code… » dans le menu de l'icône
- [ ] Essai réel : une revue appliquée par Claude Code sur un projet

## Monétisation (demandé le 6 oct. 2026)

Essai gratuit puis licence, le plus simplement possible : **Polar** encaisse (vendeur officiel, TVA, factures) et délivre une clé de licence que l'app active et vérifie directement par l'API publique de Polar, **sans serveur ni base de données à nous**. Achat unique ou abonnement : même code dans l'app (Polar révoque la clé d'un abonnement résilié), le modèle se choisit dans Polar et sur la page Tarifs. Après l'essai (`TRIAL_DAYS`, 14 jours par défaut, sans carte), seules les **nouvelles captures** sont bloquées ; sessions, exports et Claude Code restent accessibles. Dépôt **privé** ; téléchargements et mises à jour sur Cloudflare.

Adresses (domaine **vibescreener.dev**, acheté sur Cloudflare le 6 oct.) : `<domaine>` site, `relay.<domaine>` relais + PWA (même Worker que `pastille.vibescreener.workers.dev`, gardé : mêmes rooms, rien ne casse), `dl.<domaine>` bucket R2 (`latest.json`, `install.sh`, .dmg).

**M0 — Comptes et décisions (toi)**
- [ ] Statut (micro-entreprise) et SIRET
- [x] Prix (bac à sable) : licence à vie 19,99 € TTC, abonnement mensuel 1,99 € TTC (frais Polar 5 % + 0,50 $ par paiement : environ 1,10 € restent sur 1,99 €)
- [x] Domaine vibescreener.dev sur Cloudflare
- [x] Polar en bac à sable : organisation `vibescreener`, benefit « Licence VibeScreener » (3 activations), deux produits et leurs liens de paiement ; branchement vérifié (une fausse clé est refusée par Polar)
- [x] Achat de test (carte 4242…) : la clé reçue s'active et se revérifie auprès de Polar avec le module de licence de l'app (activation de test retirée ensuite)
- [x] Même essai dans l'app lancée (`PASTILLE_POLAR=sandbox PASTILLE_TRIAL_DAYS=0 pnpm dev`) : essai terminé, clé collée dans Réglages › Licence, licence active (6 oct.)
- [ ] Polar en production : mêmes réglages (même slug `vibescreener`), compte bancaire, vérification d'identité, puis l'Organization ID dans `POLAR.production` et les liens de paiement sur le site

**M1 — Dépôt privé et Cloudflare tenu proprement**
- [ ] Dépôt privé, Releases v0.1.0 à v0.4.2 supprimées (personne n'a installé la version MIT)
- [x] `LICENSE` → tous droits réservés
- [x] `relay.vibescreener.dev` (domaine personnalisé, workers.dev gardé), `observability` : déployé le 6 oct. ; vérifié qu'un côté sur chaque adresse se retrouve dans la même room (0,5 s)
- [x] Bucket R2 `vibescreener-downloads` sur `dl.vibescreener.dev` (vide jusqu'à la première version) ; site déployé sur `vibescreener.dev` (prix et mentions légales encore à compléter)
- [x] Jeton API Cloudflare limité (Workers, R2, routes et DNS de vibescreener.dev) : secret `CLOUDFLARE_API_TOKEN` et variable `CLOUDFLARE_ACCOUNT_ID` dans le dépôt
- [ ] `ci.yml` (déploiement au push sur main, R2 au tag, `check` sous ubuntu, macOS réservé aux tags) : actif une fois cette branche fusionnée ; passage sous Linux à vérifier au premier push

**M2 — Licence dans l'app**
- [x] `src/main/license.ts` + tests : essai, activation et vérification Polar (toutes les 24 h, 30 jours hors ligne), révocation ; `PASTILLE_TRIAL_DAYS`, `PASTILLE_POLAR=sandbox`
- [x] Blocage dans `startCapture()`, onglet « Licence » des réglages, ligne d'essai dans le menu de l'icône, phrase dans l'assistant
- [x] Organisation Polar du bac à sable et portails clients dans `POLAR` (`license.ts`) ; celle de production au lancement
- [x] `updater.ts` et `install.sh` vers `dl.<domaine>` ; `RELAY_URL` → `relay.<domaine>` (`vibescreener.dev`)
- [x] `pnpm e2e` photographie l'onglet Licence

**M3 — Site** (`apps/site`, HTML/CSS statique)
- [x] Landing reprise de la maquette « VibeScreener — landing » (canevas Claude Design, 6 oct.) : démo animée sur une app d'exemple, avant/après, 3 gestes, fonctionnalités, éditeur, **tarifs** (deux cartes, chacune retirable), FAQ, appel final ; polices hébergées sur le site (pas de Google Fonts) ; vérifiée en local à 375 px et au bureau
- [x] Mentions légales, licence d'utilisation et remboursement, confidentialité, licences tierces (whisper.cpp, modèle Whisper, Electron : MIT) ; `/install.sh` redirigé vers `dl.<domaine>`
- [x] Prix sur la page (19,99 € et 1,99 €/mois), pas encore republiée
- [ ] Compléter les « À COMPLÉTER » : liens de paiement de production, e-mail de contact, identité, statut, SIRET et adresse (mentions légales)

- [x] Cartes des fonctionnalités retournables (« + » → détail) et Mac interactif « À vous d'essayer » (clics → demandes → Claude Code), repris de la maquette ; vérifiés à 375 px et au bureau

- [x] Windows fusionné (main 0.7.0 dans cette branche) : la CI publie aussi le .exe et `install.ps1` sur R2, `vibescreener.dev/install.ps1` y redirige, la mise à jour Windows lit `latest.json`. La Release GitHub reste publiée pour les apps ≤ 0.7.0 tant que le dépôt est public

**M4 — Lancement** (la 0.5.0 est déjà publiée et la 0.6.0 prise par Windows : vérifier `git ls-remote --tags` avant de choisir le numéro)
- [ ] Polar en production, liens de paiement sur le site
- [ ] Retirer la licence de test du bac à sable du Mac de dev (`license.json` dans les données de l'app), sinon la version payante la verra « plus valable »
- [ ] Tag publié sur R2 (la CI remplace `gh release create`), installation par `curl -fsSL https://<domaine>/install.sh | sh`
- [x] README et CLAUDE.md mis à jour (commandes, adresses provisoires)

*Critère : sur un Mac vierge, installation depuis le site, essai, achat (sandbox puis réel), clé activée, capture débloquée ; abonnement résilié → capture bloquée à la vérification suivante.*

## Corrections — revue « vibescreener » du 6 oct. 2026

7 points sur le site, 6 remarques générales sur l'app (lues par le MCP). Choix validés le 6 oct. : la zone est montrée sur la fenêtre (⌥ pour recadrer), le Contexte passe dans les réglages, le bouton « Nouvelle capture » devient visible, et le panneau a deux onglets Points / Remarques.

### Lot A — Site vibescreener.dev

Le site n'existe que sur la branche locale `claude/monetization-trial-subscription-07be07` (`apps/site/public/index.html`, non fusionnée) : on y travaille et on redéploie le site (`wrangler deploy`) sur ton feu vert. Les points vont du plus rapide au plus long.

- [x] **#7 Texte sous les tarifs** : supprimer les deux lignes (Polar, remboursement, fin d'essai), que la FAQ dit déjà. Garder « TTC » à côté du prix (« une fois, TTC »).
- [x] **#2 Recherche qui déborde** : « Rechercher une commande » dépasse de son champ dans les 3 copies de l'app d'exemple. Mettre « Rechercher… » et couper le texte avec `overflow: hidden` et `text-overflow: ellipsis`.
- [x] **#5 Logos** : mettre devant chaque nom le logo de Claude Code (logo Claude), Cursor, ChatGPT (logo OpenAI) et Claude, en SVG copiés dans la page depuis Simple Icons (CC0). Aucune requête vers un tiers ni dépendance. Remplacer « et toute IA qui lit un PDF » par « et toutes les autres IA ». Une ligne « marques citées » dans les mentions légales.
- [x] **#3 Proposition de valeur** : réécrire le sous-titre du hero autour du temps gagné, plus une mini-comparaison chiffrée sur un cas, par exemple « Une revue de 20 retours : 10 min à la main, 2 min avec VibeScreener ». Reprendre aussi la meta description. Le titre ne change pas.
- [x] **#4 Cadre orange** : supprimer le cadre épais affiché pendant toute l'animation du hero. À la place, un effet de capture bref repris de l'overlay de l'app : éclair, léger assombrissement et étiquette « Écran figé », qui disparaissent en 1 s.
- [x] **#6 Calculateur de temps gagné** : il remplace la section « Arrêtez de décrire. Montrez. » (Sans / Avec).
  - Trois curseurs : écrans par revue (10), retours par écran (3), revues par semaine (5).
  - Hypothèses affichées : 30 s par retour à la main (capture, recadrage, collage, décrire l'endroit) contre 5 s avec VibeScreener (un clic, une phrase), et 2 min contre 5 s pour assembler et envoyer la revue.
  - Résultat par revue (≈ 17 min contre 2 min 30) et par mois (≈ 5 h gagnées).
  - Une trentaine de lignes de JS dans la page, `input type=range` étiquetés, résultat annoncé (`aria-live`). Sans JS, les valeurs par défaut restent écrites dans le HTML.
- [x] **#1 Animation Claude Code + MCP** : un 2ᵉ acte au hero, toujours en CSS, cycle d'environ 26 s.
  - Après « 3 demandes prêtes pour l'IA », un terminal Claude Code glisse par-dessus avec la demande « applique la revue VibeScreener ».
  - Viennent ensuite les appels `vibescreener · lire_revue` (1 écran, 3 demandes) et `voir_ecran`, puis trois `Update(src/pages/Ventes.tsx)` cochés #1, #2, #3.
  - Retour sur l'app corrigée : filtres 7 j / 30 j / 12 mois, tri, bouton CSV, recherche par e-mail.
  - Les pourcentages des keyframes de l'acte 1 sont recalés sur la nouvelle durée. `prefers-reduced-motion` est respecté.
- [x] Vérifié en local (serveur statique, navigateur à 1440, 860 et 375 px : hero, démo image par image, logos, calculateur), sans erreur console
- [x] Site déployé sur vibescreener.dev le 6 oct. (commit `c852a2a` de la branche monétisation)

### Lot B — App desktop

Sur main, cette branche. Les remarques vont de la plus gênante à la plus lourde.

- [x] **B1 Échap supprime un point vide** : sans texte, dictée en attente ou en erreur, croquis ni inspiration, Échap retire le point, depuis la bulle (`bubbleKeys`) comme depuis l'éditeur (branche Échap du clavier global).
  - Même règle que les remarques générales vides (`editor.tsx`, `noteKeys`).
  - Nouvelle méthode du store (IPC `annotation:discard`) qui retire le point et l'instantané d'annulation de sa création : ⌘Z ne fait pas revenir un point vide.
  - Une dictée déjà envoyée (silence de 3 s) compte comme « en attente », pour ne pas la perdre.
  - Test dans `session-store.test.ts`.
- [x] **B2 Contexte dans les réglages** : retirer le champ de l'en-tête de l'éditeur (`editor.tsx`, `editor.html`, `texts.ts`).
  - Nouveau réglage « Contexte du projet » dans l'onglet Export, à côté des instructions pour l'IA.
  - Il s'applique à la session ouverte et aux suivantes, et remplace l'héritage caché `lastContext` (repris comme valeur de départ).
  - Les exports et le MCP ne changent pas : ils lisent toujours `session.context`.
- [x] **B3 « Nouvelle capture » visible** : la vignette ressemble à une capture. Elle devient un vrai bouton orange « ＋ Nouvelle capture ⌃⌥⌘P » au bout de la bande. Le même bouton s'affiche dans l'éditeur vide.
  - À vérifier au passage : le micro préparé au clic est refermé quand l'éditeur se masque (`visibilitychange` → `recorder.close()`), ce qui fait perdre l'avance de la dictée.
- [x] **B4 Onglets Points / Remarques générales** : deux onglets en haut du panneau de droite, chacun sur toute la hauteur, avec le compte de remarques sur l'onglet.
  - La navigation d'écran n'apparaît que sur l'onglet Points.
  - Sélectionner un point ou capturer bascule sur Points, « Ajouter une remarque » bascule sur Remarques.
  - Variante sombre du contrôle `.segmented` de `theme.css`.
- [x] **B5 Dock et barre des tâches** :
  - **Mac** : icône dans le Dock en plus de l'icône de la barre des menus. On retire `LSUIElement` (`electron-builder.yml`) et `app.dock.hide()`, et un clic sur le Dock ouvre l'éditeur (`app.on('activate')`). Menu d'app minimal (VibeScreener, Édition, Fenêtre).
  - **Windows** : l'icône reste dans la zone de notification. Fermer l'éditeur le réduit au lieu de le masquer, pour qu'il reste dans la barre des tâches.
  - **Limite à signaler** : Windows n'affiche rien dans la barre des tâches sans fenêtre ouverte. L'épinglage reste possible via le menu Démarrer.
  - Textes « barre des menus seulement » à revoir dans `texts.ts`, `README.md` et `docs/SPEC.md`.
- [x] **B6 Zone montrée, ⌥ pour recadrer** : glisser dans l'overlay capture la fenêtre qui contient le centre de la zone, ou l'écran s'il n'y en a pas (même repérage que le clic).
  - La zone devient le point #1, de type rectangle, déjà géré par l'éditeur, les exports et le MCP. Bulle ouverte et dictée lancée, comme pour un clic.
  - ⌥ + glisser recadre comme aujourd'hui, avec l'aide « ⌥ Glisser : recadrer » dans l'overlay. ⇧ + clic reprend la dernière zone dans le même mode. Les inspirations restent recadrées.
  - Fichiers : `overlay.ts`, `ipc.ts` (option de la zone), `capture.ts` (`finish`), `index.ts` (`onCapture`).
- [x] `pnpm test` (37/37) et `pnpm typecheck` ; photos de l'éditeur (onglets, bouton) relues pendant le développement
- [ ] `pnpm e2e` sur le code final : par la CI, plus sur le Mac de l'utilisateur (les fenêtres de test passaient devant tout)
- [ ] Essai réel sur Mac : Échap puis ⌘Z, Dock et menu de l'app, zone avec et sans ⌥, retour de l'éditeur au premier plan après une capture ; Windows (Alt + glisser, éditeur réduit) par la CI puis sur un PC
- [ ] Version suivante et Release (tag `v*`) sur ton feu vert.

## Mode vidéo, à la XAnnotate (demandé le 7 oct. 2026)

On relit son app sans s'arrêter : ⌃⌥⌘R (Windows : Ctrl+Alt+R) lance l'enregistrement, on navigue par des clics seuls, et **⌘ + clic (Ctrl + clic) suivi de paroles devient un point**. Un point sans parole ne laisse rien ; ce qui est dit hors d'un point devient une remarque générale ; les points d'une page qui n'a presque pas changé vont sur le même écran. ⌃⌥⌘R ou « Arrêter » dans le bandeau arrête et ouvre l'éditeur.

Choix validés le 7 oct. : un clic = un point (revu après le premier essai : ⌘ + clic = un point, clic seul = navigation) ; **pas de fichier vidéo** (images clés + parole, comme XAnnotate) : la vidéo devient une session ordinaire, éditeur, exports, MCP et modèle de données inchangés ; 2ᵉ raccourci fixe ⌃⌥⌘R ; points regroupés par écran.

Une seule nouvelle dépendance : `uiohook-napi` (clics globaux, qu'Electron ne sait pas écouter). Sur Mac, elle exige l'autorisation **Accessibilité**, oubliée à chaque mise à jour (app signée ad hoc), comme l'enregistrement d'écran.

### Lot V0 — Lever les deux risques

Les deux briques de V1, mesurées (lignes `VIDEO {json}`) sur le Mac, avec accord avant de lancer l'app.

- [ ] **Clics globaux** (`clicks.ts`, `uiohook-napi`) dans l'app empaquetée : chargement depuis `app.asar.unpacked`, demande d'Accessibilité, clics reçus quand une autre app est au premier plan, pas de plantage en tapant au clavier (point fragile connu de libuiohook sur macOS), autorisation perdue après une mise à jour
- [ ] **Image d'avant le clic** : fenêtre cachée `video`, un flux `getUserMedia` par écran (10 images/s, résolution physique), dernière image gardée (`MediaStreamTrackProcessor`) ; sur un menu qui s'ouvre au clic, l'image montre l'état d'avant
- [ ] **Coût** : CPU et mémoire pendant 10 min, sur 1 puis 2 écrans
- [ ] **Fenêtre visée** : la liste des fenêtres, prise juste après le clic, n'est pas faussée par un menu ou une popup qui s'ouvre

- [x] Code des deux briques et du cœur (7 oct.) : `clicks.ts`, fenêtre cachée `video` (+ `video-window.ts`), `video.ts` avec ses règles (parole, silences, remarque, regroupement) et 8 tests ; ⌃⌥⌘R et « Enregistrer une vidéo » dans le menu de l'icône ; lignes `VIDEO` (par clic : délai clic → image figée, âge de l'image ; toutes les 30 s : processeur et mémoire)
- [x] App empaquetée construite en local : `uiohook-napi` est dans `app.asar.unpacked` et se charge depuis l'app (vérifié sans la lancer)
- [ ] Essai réel sur le Mac, dans l'app publiée (0.8.0, demandé le 7 oct. : l'app de test locale butait sur l'autorisation d'écran, liée à l'app installée de même identifiant) : Accessibilité, clics, image d'avant le clic, frappe au clavier, 10 min de mesures

*Critère : 10 clics sur une page qui réagit au clic donnent 10 images « avant le clic » ; clic → image figée < 50 ms ; VibeScreener < 20 % d'un cœur hors transcription.*
*Repli si les clics globaux ne tiennent pas : « une touche = un point » par `globalShortcut`, sans module natif ni Accessibilité.*

### Lot V1 — Le mode vidéo de bout en bout

- [x] Parité des annotations demandée le 7 oct. : glisser = cadre, ⇧ + glisser = flèche, ⌥/Alt = image recadrée ; aperçu pendant le glissement, bornes de l'écran respectées, fenêtre sous le centre du cadre choisie depuis la liste prise avant le geste
- [x] Dessin sur la tablette pendant la vidéo : point actif dès que la parole est détectée, bouton pour un dessin sans dictée, pas d'attachement au point précédent pendant la préparation ; même stockage et mêmes exports
- [x] Inspiration pendant la vidéo : point gardé avant la recherche, clics et voix suspendus pendant la recherche, capture jointe au point initial puis reprise sans ouvrir l'éditeur ; annulation et arrêt referment aussi la capture d'inspiration
- [x] Retour visuel pendant la vidéo (7 oct.) : même pastille numérotée que la capture d'écran au clic, bandeau « Micro ouvert » puis « Dictée en cours », onde du micro et durée ; fenêtres transparentes sans focus qui laissent passer les clics, sur l'écran du point ; les clics sans parole ne consomment pas de numéro. Tests des états et de la numérotation, rendu vérifié avec un micro simulé
- [x] Ergonomie revue après le premier essai (7 oct.) : clic seul = navigation, qui termine le point en cours ; ⌘ + clic (Ctrl + clic) = point, ⌘ + glisser = cadre (+ ⇧ flèche, + ⌥/Alt recadrer). Tant que ⌘ / Ctrl est tenu, les fenêtres du retour prennent la souris : le clic n'atteint pas l'app (pas d'onglet ouvert par un ⌘-clic) ; elles sont des panneaux macOS qui n'activent pas VibeScreener. Bandeau : bouton « Arrêter ⌃⌥⌘R », touches affichées (⌘ s'allume quand on la tient), voix dirigée vers « Point N » ou « Remarque générale », placé au-dessus du Dock / de la barre des tâches. Tests des clics (navigation, touche tenue pendant un glissement, relâchement manqué) et de la remarque après navigation
- [x] Commentaire écrit pendant la vidéo (demandé le 7 oct.) : bouton « Écrire » dans le bandeau ; le texte rejoint le point en cours, ou une remarque générale sans point. Le bandeau prend le clavier le temps de la saisie (micro suspendu, clics ignorés) ; Entrée ou clic ailleurs valide, Échap annule. Rendu vérifié dans un navigateur avec un IPC simulé
- [x] Revue du 7 oct. (19 h 12) : le bouton « Écrire » devient un champ toujours affiché dans le bandeau (un clic dedans prend le clavier, la fenêtre restant non focalisable le reste du temps) ; page du bandeau sans défilement (`overscroll-behavior: none`, molette bloquée), cause supposée du cadre ⌘ + glisser qui bougeait au défilement
- [ ] Essai réel : le cadre tracé reste fixe quand l'app défile
- [ ] Essai réel du commentaire écrit sur Mac et Windows : le champ reçoit bien la frappe (panneau macOS rendu focalisable), puis un clic rend la main à l'app relue
- [ ] Essai réel de cette ergonomie sur Mac et Windows : ⌘ + clic sans effet dans l'app (lien, bouton), clic seul qui navigue, VibeScreener qui ne passe pas au premier plan, ⌘ + Tab et raccourcis clavier inchangés, menu au survol (garder la souris immobile en appuyant sur ⌘)
- [ ] Essai réel du retour visuel sur Mac et Windows, dont plusieurs écrans et app en plein écran. `setContentProtection(true)` ne garantit pas l'exclusion du retour des images sur les macOS utilisant ScreenCaptureKit (limite Electron : https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable)
- [ ] ⌃⌥⌘R démarre et arrête (signalé s'il est déjà pris), aussi dans le menu de l'icône ; barre « ● 0:42 · 3 points · Arrêter » affichée pendant l'enregistrement, même barre flottante désactivée
- [ ] Segments (`video.ts`, sans `electron`, testable) : l'audio d'un clic au suivant ; parole = au moins 3 morceaux de 100 ms au-dessus du seuil de la dictée ; silences de plus d'1 s retirés avant Whisper ; finalisés dans l'ordre
- [ ] Clic + parole → point (recadré sur la fenêtre cliquée, même logique que la capture) ; clic seul → rien ; paroles avant le 1ᵉʳ clic → remarque générale ; même fenêtre et vignette quasi identique → même écran
- [ ] Clics ignorés : bouton droit, 2ᵉ clic d'un double-clic, hors de la zone utile (barre des menus, Dock, barre des tâches), sur nos fenêtres
- [ ] Arrêt → éditeur sur le premier écran enregistré, transcriptions déjà en route ; sans point : « Cliquez sur un élément puis parlez »
- [ ] Licence expirée (même blocage que la capture), Accessibilité manquante (message + Réglages Système) ; pendant l'enregistrement ⌃⌥⌘P est sans effet, « Nouvelle session » et « Ouvrir » l'arrêtent d'abord, un changement d'écrans aussi
- [ ] `addAnnotation` passe dans le store, avec un `addNote` qui crée la session au besoin ; repérage de la fenêtre sous un point extrait de `capture.ts` (`windowTarget`)
- [ ] Tests unitaires `video.test.ts`

*Critère : 10 retours sur 3 pages en < 2 min sans s'arrêter ; à l'arrêt, 3 écrans et 10 points bien placés et transcrits, aucune trace des clics de navigation ; le PDF et le Markdown donnés à Claude restituent les 10 retours.*

### Lot V2 — CI, docs, version

- [ ] `PASTILLE_AUTOTEST=video` sur le Windows de la CI : faux micro (phrases séparées par des silences), clics simulés, vraie capture ; points transcrits, rien pour les clics sans parole
- [ ] `pnpm e2e` photographie la barre en enregistrement
- [ ] `docs/SPEC.md` (§4.10 Mode vidéo), README (autorisation Accessibilité), `CLAUDE.md`
- [ ] Version suivante et tag `v*` sur ton feu vert

**Limites à signaler** : indicateur d'enregistrement d'écran affiché tout du long (macOS 15+ peut redemander l'autorisation d'une capture continue) ; le curseur apparaît dans les images (la pastille le recouvre) ; sous Windows l'icône de la zone de notification ne change pas (la barre est le seul témoin) et AltGr+R est à vérifier en AZERTY.

**Plus tard [C], non prévu** : dessin à la souris pendant l'enregistrement (le dessin sur tablette est disponible), fichier vidéo rejouable, images du parcours sans parole, horodatage dans les exports, raccourci vidéo réglable.

### Multilingue (7 oct.)

App, PWA tablette, scripts d'installation et site en cinq langues : français, anglais, espagnol, allemand, italien.

- [x] App : dictionnaires `apps/desktop/src/texts/` partagés par les fenêtres et le processus principal (dialogues, menu Mac, info-bulle, exports, MCP aux noms d'outils inchangés) ; réglage « Langue de l'interface » (automatique = langue du système, anglais sinon ; installations existantes gardées en français) ; glossaire Whisper et instructions par défaut qui suivent la langue ; demande d'accès au micro traduite sur macOS
- [x] PWA selon la langue de la tablette ; `install.sh` / `install.ps1` selon la langue du système (servis en UTF-8)
- [x] Site : modèles + dictionnaires + `build.ts` ; français à la racine, `/en/`, `/es/`, `/de/`, `/it/` ; hreflang, sélecteur de langue, redirection à la première visite selon la langue du navigateur (robots exclus) ; pages légales traduites (« la version française fait foi »)
- [ ] Relecture des traductions par des locuteurs natifs, surtout les pages légales
- [ ] Photos des fenêtres dans chaque langue (`PASTILLE_LANG=de pnpm e2e`), pour les textes trop longs

## Corrections — revue du 7 oct. 2026 (14h25)

8 remarques générales sur l'app, 1 point sur le site (lus par le MCP). Choix validés le 7 oct. : icône du Dock seulement tant qu'une fenêtre est ouverte ; « Nouvelle session » ouvre l'éditeur vide avec deux boutons, capture et vidéo ; Accessibilité non bloquante dans l'assistant. La dictée en panne (collègue sur Mac et Windows, puis sur PC) venait d'une version pas à jour : rien à changer, mais les mises à jour passent en priorité.

### Lot G — Site : frise sous la démo (#1)

L'IntersectionObserver relance la démo à son arrivée à l'écran, pas la frise `.vs-prog`, qui tourne depuis le chargement : décalée du temps de défilement.

- [x] Frise relancée avec la démo, placée dans `.vs-zoom` (même zoom au défilement)
- [x] Fin de cycle en fondu au lieu du recul des quatre barres ; `prefers-reduced-motion` : frise figée sur l'image affichée
- [x] Vérifié en local (bureau et 375 px) : frise et démo repartent ensemble après un défilement, fondu en fin de cycle
- [ ] Déploiement (`pnpm site:deploy`) sur ton feu vert

### Lot D — Mises à jour fiables et visibles

Aujourd'hui : un échec de vérification efface la mise à jour connue (contrôle toutes les 6 h seulement) ; après la confirmation, rien ne se voit pendant ~1 min ; un 2ᵉ clic lance un 2ᵉ script ; les échecs ne vont que dans `update.log` ; après relance, rien ne dit que l'app a changé.

- [x] Vérification avec délai maximal (10 s), dernière version connue gardée en cas d'échec, revérifiée à l'ouverture du menu (au plus toutes les 10 min)
- [x] L'app télécharge elle-même l'installeur : « Téléchargement de la mise à jour… 42 % » dans le menu, un seul à la fois, erreur affichée avec « Réessayer »
- [x] Le script (téléchargé lui aussi) reçoit le fichier par `PASTILLE_DMG_FILE` / `PASTILLE_EXE_FILE` (les `*_URL` restent pour les anciennes apps), chemins passés par l'environnement et non dans la commande ; l'app se ferme d'elle-même. Windows : `--quit` lu aussi au lancement, pour qu'une app qui se ferme encore ne se relance pas pendant l'installation
- [x] Téléchargements (`downloadFile`) abandonnés après 60 s sans données, au lieu d'un pourcentage figé
- [x] Au lancement suivant : « VibeScreener mis à jour (x.y.z) », ou « La mise à jour n'a pas abouti » avec le journal (Windows : `setAppUserModelId` pour que la notification s'affiche)
- [x] Commande d'installation du site (`install.sh`, `install.ps1`) : toute ancienne version désinstallée avant la nouvelle
  - Mac : copies de VibeScreener (ou Pastille) cherchées dans `/Applications` **et** `~/Applications`, pas seulement dans le dossier d'installation (une ancienne copie restait et pouvait être relancée) ; l'app lancée est quittée où qu'elle soit
  - Mac : le nouveau .dmg est ouvert et vérifié **avant** de supprimer l'ancienne app (aujourd'hui, un .dmg illisible laissait le Mac sans app)
  - Mac : Accessibilité remise à zéro comme l'écran et le micro ; attente de fermeture 30 s, abandon avec message plutôt que remplacer une app encore lancée
  - Windows : l'installeur NSIS désinstalle déjà l'ancienne version ; l'app encore lancée après 10 s est arrêtée au lieu de faire échouer l'installation
- [x] Tests : `updater.test.ts` (version gardée en cas d'échec, fichiers par plateforme, chemins hors de la commande, bilan au lancement), `whisper.test.ts` (téléchargement bloqué abandonné sans fichier)
- [ ] Essai réel : mise à jour depuis le menu sur Mac et sur PC (progression, fermeture, notification au retour) ; commande du site avec une ancienne copie dans l'autre dossier d'applications
- *Limite : la mise à jour vers cette version passe encore par l'ancien code de l'app (mais déjà par le nouvel `install.sh`) ; le nouveau parcours sert à partir de la suivante.*

### Lot E — Assistant et autorisations

- [x] Ligne « Accessibilité — pour le mode vidéo » (Mac, facultative) ; le mode vidéo (⌃⌥⌘R) présenté à la dernière étape
- [x] L'étape 2 suit l'état réel de Whisper (chargement, prêt, erreur) au lieu de « modèle présent »
- [x] L'assistant revient tant qu'il n'est pas fini : ouvert avant le chargement de Whisper ; terminé au bouton « Terminer » seulement ; revient au premier plan dès qu'une autorisation est accordée (retour des Réglages Système) ; Dock, 2ᵉ lancement et « Ouvrir l'éditeur » le montrent tant qu'il manque une autorisation
- [x] Réglages : onglet « Autorisations » (écran, micro, Accessibilité), mêmes lignes que l'assistant
- [x] Vérifié dans un navigateur avec un faux preload (pages construites) : étapes 1 à 3, étape 2 en chargement et en erreur, onglet Autorisations, éditeur vide à deux boutons, panneau vidéo avec « Arrêter », menu pendant le téléchargement d'une mise à jour
- [ ] Essai réel sur Mac : retour de l'assistant depuis les Réglages Système, Accessibilité accordée sans relancer

### Lot F — Dock, nouvelle session, vidéo

- [x] **Cause probable de l'icône du Dock qui disparaît** : le panneau de la vidéo (`video-feedback.ts`) appelle `setVisibleOnAllWorkspaces` sans `skipTransformProcessType`, ce qui fait cacher l'icône du Dock par Electron dès la première vidéo (la capture et la barre ont déjà l'option)
- [x] Mac : icône du Dock seulement tant qu'une fenêtre est ouverte (`LSUIElement` + petit module `dock.ts` piloté par l'état des fenêtres, masquage différé de 1,5 s), sans clignotement pendant une capture ; « Ouvrir l'éditeur » la fait revenir
- [x] « Nouvelle session » ouvre l'éditeur vide : « ＋ Nouvelle capture ⌃⌥⌘P » et « ● Enregistrer une vidéo ⌃⌥⌘R » (bouton vidéo aussi au bout des vignettes)
- [x] Bouton « Arrêter ⌃⌥⌘R » dans le panneau du bas pendant la vidéo, actif même pendant une autre action
- [x] Tests : `dock.test.ts` (apparition immédiate, retrait différé, annulé si une fenêtre se rouvre, attente de la fin d'une capture) ; textes, README et SPEC sans « le Dock »
- [x] `pnpm test`, `pnpm typecheck` ; version **0.10.0** (avec le menu ≡ de l'éditeur de la 0.9.2)
- [ ] Photos e2e par la CI ; essai réel sur Mac et PC

### Lot H — Site : revue du 7 oct. (19 h 12)

- [x] Un seul sélecteur de mode : celui du hero, fixé en haut de l'écran une fois sorti par le haut (la pastille collante en double est retirée) ; démo décalée sous lui
- [x] Plus de raccourcis hors des démos (`#demo`, `#essayer`) : sélecteur, cadre REC du hero, étapes « Comment ça marche » (bouton du mode à la place des touches), fonctionnalités, FAQ, appel final ; textes reformulés dans les cinq langues (« clic de commentaire » au lieu de ⌘ + clic)
- [x] Frises des deux démos en puces : progression dans le fond de la puce, étape en cours élargie ; 2 × 2 sous 640 px
- [x] Calculateur « Combien de temps gagnez-vous ? » déplacé juste avant les tarifs ; les étapes suivent directement les logos
- [x] Vérifié en local (bureau et 375 px, capture et vidéo) : sélecteur fixé, aucun glyphe de touche hors des démos, ordre des sections
- [ ] Déploiement (`pnpm site:deploy`) sur ton feu vert

### Lot I — Mise à jour par la commande du site, version 0.13.0

- [x] « Mettre à jour » n'installe plus rien : une fenêtre donne la commande d'installation du site (`curl … | sh` sur Mac, `irm … | iex` sous Windows) et le terminal où la coller, avec « Copier la commande ». Le script ferme l'app, la remplace et la rouvre. Plus de téléchargement dans l'app ni de pourcentage dans le menu (moins de cas d'échec)
- [x] Le bilan au lancement (`updatingTo`) reste pour les mises à jour lancées depuis une version ≤ 0.12.0
- [x] Site : le sélecteur fixé ne revenait plus à sa place en remontant (emplacement réduit à une largeur nulle, invisible pour l'observateur) et pouvait rester rattaché au hero (animation d'apparition) ; corrigé et vérifié du haut au bas de la page, aller et retour
- [x] Version **0.13.0** (avec le champ de commentaire du bandeau vidéo)
- [ ] Essai réel : bouton « Mettre à jour » sur Mac et PC ; commentaire écrit et cadre fixe au défilement pendant la vidéo
- [x] Logo E3 sur le site (en-têtes et pieds de page, landing et pages légales) : « vibe » en Fraunces italique, « screener » dans des coins de viseur aérés ; Fraunces hébergée ici, réduite aux lettres de « vibe » (3 Ko), créditée dans les licences tierces

## Commenter des documents (demandé le 8 oct. 2026)

On ouvre un PDF, un Word, un Excel ou un PowerPoint dans l'app et on le commente comme une capture : points numérotés, dictée, croquis, exports pour l'IA, MCP. En plus, une **copie commentée** du document reçoit les commentaires au format du document (notes PDF, commentaires Word et PowerPoint, notes Excel). L'original n'est jamais modifié.

Choix validés le 8 oct. :
- comme la vidéo, **le document devient une session ordinaire** : chaque page est une capture, l'éditeur sert de visionneuse ;
- pdf.js pour les PDF, `@silurus/ooxml` (visionneuse intégrée, rien à installer) pour Word, Excel et PowerPoint ;
- réécriture dans les quatre formats ;
- pastilles « comme le format le permet » : la note PDF a l'apparence de la pastille, les commentaires Office sont préfixés « #3 — ».

Une seule nouveauté dans le modèle : `Capture.source.document` (document, page, nombre de pages). L'original est copié dans `documents/<id>.<ext>` et la carte du texte de chaque page est écrite à côté de son image (`captures/<id>.json`), pour citer le texte visé sans relancer de rendu.

Dépendances : `pdfjs-dist` et `pdf-lib`. Le rendu se fait dans le processus principal, avec `@napi-rs/canvas` (celui des exports) : pas de fenêtre cachée.

### Lot DOC1 — PDF de bout en bout

- [x] « Commenter un document… » dans le menu de l'icône et le menu ≡, bouton dans l'éditeur vide et au bout des vignettes, PDF déposé sur l'éditeur (`webUtils.getPathForFile`)
- [x] Ouverture (`document/open.ts`) : nouvelle session nommée d'après le fichier, sauf si la session ouverte est vide ; licence comme la capture ; vidéo arrêtée d'abord ; rien n'est créé si le fichier est illisible
- [x] Refus avec message : PDF protégé par mot de passe, .doc/.xls/.ppt, Word/Excel/PowerPoint (« exportez en PDF » en attendant le lot DOC2)
- [x] Plafond de 200 pages, avec un message
- [x] Rendu (`document/pdf.ts`) : 144 ppp (A4 = 1190 × 1684), polices standard, CMaps et décodeurs de pdf.js lus sur le disque, carte du texte ; la page 1 s'affiche tout de suite, la progression est dans l'en-tête. Mesuré sur un vrai PDF de 310 pages : 100 à 150 ms par page
- [x] Éditeur : « Page 3 · 2 points » et nom du document ; page ajustée à la largeur ; la molette fait défiler, ⌘ / Ctrl + molette zoome
- [x] Exports et MCP : pages sans point sautées (numéros d'écran inchangés) ; titre « Page 3 / 12 — rapport.pdf » ; « texte visé : « … » » devant la position ; `voir_ecran` donne la liste des pages commentées ; instructions par défaut propres aux documents (`instructionsDocument`), si le réglage n'a pas été modifié
- [x] Copie commentée (export « Copie commentée du document », `document/commented-pdf.ts`) :
  - les points deviennent des notes `/Text` à l'apparence de la pastille, les zones des `/Square`, les flèches des `/Line` ;
  - commentaire « #3 — texte (1 croquis dans l'export VibeScreener) » ;
  - écrite dans le dossier d'export sous le nom « rapport (commenté).pdf », puis « (commenté 2) » : un fichier existant n'est jamais remplacé ;
  - rotations de page prises en compte (vérifiées contre pdf.js).
- [x] Tests `document/document.test.ts` (6) ; textes dans les cinq langues ; éditeur construit vérifié dans un navigateur avec un faux preload (page, défilement, menu d'export, éditeur vide en allemand)
- [ ] Essai réel sur Mac, avec ton accord :
  - un PDF déposé, 10 points dictés ;
  - copie commentée ouverte dans Aperçu et Acrobat (Aperçu peut dessiner sa propre icône de note au lieu de la pastille) ;
  - export Markdown donné à Claude.
- [ ] App empaquetée : pdf.js chargé depuis l'asar (worker de pdf.js dans le même fil), fichiers exclus dans `electron-builder.yml`

*Critère : un PDF de 20 pages ouvert par glisser-déposer, 10 points dictés sur 4 pages en < 3 min ; l'export PDF pour l'IA ne contient que les 4 pages et cite le texte visé ; la copie commentée montre les 10 pastilles et leurs notes dans Aperçu et Acrobat.*

### Lot DOC0 — Risques Office

Mesuré le 8 oct. sans tes fichiers, sur des modèles Office des apps installées et des fichiers de test fabriqués :

- [x] **Mode Node** (`@silurus/ooxml/node`) avec `@napi-rs/canvas` : pages Word et diapositives rendues dans le processus principal, comme les PDF. Pas de fenêtre cachée.
  - Word : 10 à 20 ms par page. Chaque morceau de texte connaît son paragraphe d'origine (`source.path`, y compris dans un tableau), ce qui permet d'ancrer un commentaire Word.
  - PowerPoint : ≈ 100 ms par diapositive. Le texte vient des formes.
- [x] **Excel** : la bibliothèque ne dessine les feuilles que dans un navigateur (Worker). On dessine donc la grille nous-mêmes à partir du classeur qu'elle lit (`document/xlsx.ts`) :
  - valeurs, formats de nombres et de dates courants, gras/italique/couleurs, fonds, bordures, fusions, largeurs, en-têtes A, B, C et 1, 2, 3 ;
  - position exacte de chaque cellule, donc un point vise « B12 » ;
  - les graphiques et images posés sur les feuilles ne sont pas dessinés.
- [x] **Polices** :
  - si Office est installé (Mac), ses polices (Calibri, Cambria, Aptos…) sont chargées ;
  - sinon, les polices Office manquantes sont remplacées par Arial, Times New Roman et Courier New ;
  - sans cela, des lettres accentuées en gras manquaient.
- [ ] Fidélité sur tes vrais fichiers (tableaux complexes, SmartArt, graphiques) : à voir à l'essai réel

### Lot DOC2 — Word, Excel, PowerPoint à l'affichage

- [x] .docx/.docm/.dotx, .pptx/.pptm/.potx, .xlsx/.xlsm/.xltx ouverts comme les PDF : par le menu, par un bouton ou par glisser-déposer ; anciens formats (.doc, .xls, .ppt) refusés avec un message
- [x] Feuilles Excel découpées en morceaux d'au plus 1200 × 1000 px (≈ 50 lignes) ; feuilles masquées et feuilles de graphique ignorées ; « Ventes A1:G50 » dans l'éditeur
- [x] Titres « Diapositive 4 / 20 — deck.pptx », « Feuille Ventes (A51:G100) — budget.xlsx » ; ancre « cellule B51 de la feuille Ventes (« Magasin 50 ») » ou « plage C2:G10 » ; texte de la forme visée dans PowerPoint
- [x] Tests `document/office.test.ts` : rendu des trois formats, paragraphes Word, cellules Excel, formats de nombres, import en session et export

### Lot DOC3 — Copie commentée Office

Écrite dans une copie avec jszip et @xmldom/xmldom (`document/ooxml.ts`) : on ajoute des parties, des relations et des types de contenu sans toucher au reste du fichier. Les commentaires déjà présents sont gardés.

- [x] **Word** (`commented-docx.ts`) : commentaire dans la marge, de « VibeScreener » ;
  - il entoure les paragraphes visés : ceux du texte sous le point ou dans la zone, sinon le plus proche sur la page ;
  - les paragraphes sont retrouvés par leur chemin dans le corps (tableaux compris) ;
  - à défaut, le commentaire va sur le premier paragraphe du document, avec la page rappelée.
- [x] **PowerPoint** (`commented-pptx.ts`) : commentaire **moderne** (`p188:cm`, celui de PowerPoint 365 et du web), posé à l'endroit du point (`pos` en EMU), auteur « VibeScreener ».
- [x] **Excel** (`commented-xlsx.ts`) : note sur la cellule visée (`commentsN.xml` + dessin VML + `legacyDrawing` à sa place dans la feuille). Une zone ou une flèche est notée sur sa première cellule, avec la plage ; une note existante reçoit le texte à la suite.
- [x] Tests `document/commented-office.test.ts` : structure de chaque copie, ancrage (phrase, cellule de tableau, page sans texte, diapositive, feuille), copie relue par la bibliothèque, original intact. Copies ouvertes par Quick Look sans erreur.
- [ ] Essai réel : copies ouvertes dans Word, PowerPoint et Excel (Mac et web), sans message de réparation. Limite : un fichier PowerPoint qui a déjà des commentaires classiques ne montre pas les commentaires modernes dans les anciennes versions

### Revue de code du 8 oct. (agent), corrigée

- [x] **Word** : les chemins de paragraphe de la bibliothèque comptent aussi les sauts de section et de page, et se décalaient. Un paragraphe est maintenant retrouvé :
  - par son identifiant Word (`w14:paraId`) ;
  - sinon par son chemin, si le texte concorde ;
  - sinon par le texte de la page.

  La plage est remise dans l'ordre du document, et la page est rappelée si rien n'est trouvé. Test sur un Word à saut de section et saut de page.
- [x] **Excel** : la zone utilisée ne compte que les cellules qui ont une valeur, et les morceaux vides sont sautés. Une fusion sur toute une ligne donnait des centaines de pages blanches. Les morceaux sont limités au plafond dès leur calcul.
- [x] **PowerPoint** : un seul identifiant de création par diapositive, écrit dans la diapositive s'il manque. Chaque commentaire en recevait un au hasard.
- [x] **Excel** : bloc d'identifiants VML pris après le plus grand déjà utilisé.
- [x] **Import** :
  - un document sans page (feuilles toutes masquées) est refusé avec un message ;
  - la carte du texte est écrite dans la session du document, même si une autre est ouverte pendant l'import.
- [x] **PDF** : pastilles droites sur les pages tournées (matrice de l'apparence), vérifié par un rendu pdf.js.
- [x] **Éditeur** :
  - défilement horizontal borné ;
  - seul le haut de l'éditeur vide déplace la fenêtre : une zone de déplacement ne reçoit pas les fichiers déposés sous Windows.

### Lot DOC4 — CI, docs, version

- [x] `pnpm e2e` (`PASTILLE_AUTOTEST=editor`, CI Windows sur l'app installée) : un PDF, un Word, un PowerPoint et un Excel ouverts, un point chacun, export PDF et copie commentée vérifiés ; photos `editor-pdf.png`, `-docx`, `-pptx`, `-xlsx`. C'est aussi l'essai du chargement de pdf.js et de `@silurus/ooxml` depuis l'app empaquetée
- [x] `docs/SPEC.md` (§4.10 Documents, stockage, modèle), README (« Documents »), `CLAUDE.md`
- [x] Version **0.14.0** préparée (`apps/desktop/package.json`)
- [x] Tag `v0.14.0` poussé le 8 oct. : la CI a cassé sur le PDF dans l'app installée sous Windows. Word, PowerPoint et Excel passaient. Rien n'a été publié.
  - Cause : pdf.js exige un « / » final pour le dossier de ses polices, et le code mettait « \\ » sous Windows.
  - Corrigé, et l'erreur d'ouverture d'un document est maintenant écrite dans le journal du test de bout en bout.
- [x] Version **0.14.1** publiée le 8 oct. : app installée testée sous Windows (les quatre formats, PDF compris), installeurs et `latest.json` sur dl.vibescreener.dev, site redéployé

**Plus tard [C], non prévu** : défilement continu d'une page à l'autre, « Ouvrir avec VibeScreener » (associations de fichiers), relecture des commentaires déjà présents dans le document, ⌘O.
