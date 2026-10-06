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
- [x] Inspiration d'un point (hors cahier des charges, demandé) : bouton dans la bulle, l'éditeur s'efface, la capture suivante (⇧⌘2) est jointe au point au lieu de créer un écran ; aussi par ⌘V ou glisser-déposer d'une image ; reprise dans les trois exports et le MCP comme « modèle du résultat souhaité »
- [ ] Inspiration : essai réel de la capture (l'autotest n'a pas l'autorisation d'enregistrement d'écran ; chaîne vérifiée avec une image factice)
- [x] Assistant de premier lancement rouvert au démarrage tant qu'une autorisation manque (après une mise à jour, macOS les oublie) ; le micro n'est plus demandé avant l'assistant ; non bloquant, chaque fonction signale ce qui manque
- [x] Remarques générales (hors cahier des charges, demandé) : liste de commentaires non rattachés à un point, tapés ou dictés, annulables (⌘Z), repris dans les trois exports et le MCP
- [x] Mise à jour depuis le menu de l'icône (demandé) : la dernière Release GitHub est proposée, install.sh la pose et relance l'app ; macOS redemande les autorisations (app non signée)
- [x] Nom de l’app : VibeScreener (identifiants internes inchangés : `@pastille/*`, `PASTILLE_*`, `pastille://`, appId) ; PDF avec logo
- [x] Installeur .dmg (arm64, non signé, 147 Mo) avec whisper-server autonome ; testé empaqueté (`PASTILLE_AUTOTEST=editor`)
- [x] Windows publié (demandé) : `VibeScreener-Setup.exe` dans la Release, installation en une commande PowerShell (`install.ps1`, sans SmartScreen ni droits administrateur), runtime Visual C++ embarqué pour whisper-server, mise à jour depuis le menu de l'icône ; la CI installe l'app sur un Windows et la teste (e2e + 5 captures réelles)
- [ ] Essai sur un vrai PC (ou une VM Windows 11 sur le Mac) : installation, raccourci Ctrl+Shift+2, overlay, dictée au micro, menu de la zone de notification, mise à jour
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
- [ ] Raccourci par défaut : sur le Mac de test, ⇧⌘2 (et ⇧⌘0) n'arrivent jamais à Pastille, interceptés par une autre app ; ⌃⌥⌘P marche. L'enregistrement « réussit » quand même, donc rien n'est signalé. Choisir un défaut plus sûr

## Hors lot — Serveur MCP pour Claude Code [C], demandé

- [x] Serveur MCP local dans l'app (HTTP sur 127.0.0.1:3917, lecture seule) : `lister_sessions`, `lire_revue`, `voir_ecran` ; commande `claude mcp add` dans les réglages ; testé par `pnpm e2e`
- [x] Branchement facile à trouver : onglet « Claude Code » dans les réglages (commande à copier, dernière connexion), « Brancher Claude Code… » dans le menu de l'icône
- [ ] Essai réel : une revue appliquée par Claude Code sur un projet
