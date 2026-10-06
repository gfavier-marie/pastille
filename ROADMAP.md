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
