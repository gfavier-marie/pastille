# Cahier des charges — VibeScreener (anciennement Pastille)

*Outil de revue d'interface par captures annotées, dictée et croquis*

2026-10-06 · @Guillaume

> Copie du cahier des charges (doc Claude, révision 20 du 2026-10-06 : https://claude.ai/artifact/5McE8cYARGnyh3zgafLHNi).
> **Ajouts et décisions du 2026-10-06** (voir aussi `ROADMAP.md`) :
> - **Export PowerPoint (.pptx)** ajouté à la demande de l'utilisateur, au lot 4 : une diapo par écran, puis une par point.
> - **Export Markdown** (§6.3, [S]) avancé au lot 1, à côté du PDF.
> - Tablette (§11) : **iPad + Apple Pencil**. Validation **Mac et Windows** dès les POC.
> - **Mode vidéo** (2026-10-07, demandé, voir `ROADMAP.md`) : ⌃⌥⌘R enregistre ; on navigue par des clics seuls, et ⌘ + clic (Ctrl + clic) suivi de paroles devient un point ; pas de fichier vidéo, la session reste ordinaire.

## 1. Contexte et objectifs

Pastille ramène le coût d'un retour d'interface à un clic et une phrase dictée, puis livre le tout à l'IA dans un PDF prêt à l'emploi. « Pastille » est un nom de travail.

**Problème.** Après un développement assisté par IA, la relecture produit des dizaines, voire des centaines de micro-retours : déplacer un bouton, l'agrandir, changer un radius. Les lister avec une capture pour chacun prend plus de temps que les corrections elles-mêmes.

**Solution.** Une application desktop (macOS et Windows) capture l'écran au raccourci clavier. Un clic sur la capture pose un point numéroté, auquel on attache un commentaire dicté ou tapé. Une PWA sur tablette ajoute un croquis au point en cours, synchronisé instantanément. En fin de revue, un PDF structuré regroupe tout pour l'IA de code.

**Utilisateur.** Une seule personne, sur son poste. Pas de compte ni de collaboration en V1.

| Indicateur | Cible |
| --- | --- |
| Gestes pour capturer un écran | 1 raccourci + 1 clic |
| Clics pour un commentaire dicté | 1 (celui qui pose le point) |
| Attente imposée après une dictée | 0 s (transcription en arrière-plan) |
| Débit en revue réelle | 6 commentaires par minute ou plus |
| Croquis tablette visible sur le desktop | moins de 500 ms après « Envoyer » |
| Export PDF de 300 commentaires | moins de 20 s |

## 2. Principes d'ergonomie

Chaque interaction se juge au nombre de gestes : rien ne doit obliger à choisir un outil, attendre ou valider.

- **Un clic = un point.** Cliquer sur la capture crée un point. Il n'y a pas d'outil « point » à sélectionner au préalable.
- **La voix démarre seule.** Poser un point lance l'enregistrement. Poser le suivant arrête le précédent et l'envoie en transcription.
- **Jamais d'attente.** La transcription tourne en file d'attente ; le texte apparaît dans la bulle quand il est prêt.
- **Pas de bouton « OK ».** Tout est enregistré en continu ; cliquer ailleurs ferme la bulle.
- **Le clavier prend le relais sans transition.** Taper une touche pendant l'enregistrement l'annule et passe en saisie.
- **La tablette suit le desktop.** Elle dessine toujours pour le point sélectionné, sans aucune manipulation sur l'ordinateur.
- **L'app reste invisible.** Ses fenêtres n'apparaissent jamais dans ses propres captures.
- **Tout s'annule.** Ctrl/⌘+Z partout, pour aller vite sans crainte.
- **Raccourcis sans conflit.** Les valeurs par défaut évitent les raccourcis système (⌘⇧3/4/5 sur Mac, Win+Shift+S sur Windows) et restent modifiables.

## 3. Parcours utilisateur

> *[Schéma « parcours de revue · 2 boucles » : voir le cahier des charges en ligne]*

La boucle centrale ne coûte qu'un clic par commentaire ; le raccourci ne sert qu'à changer d'écran.

1. Lancer Pastille : elle se loge dans la barre de menus (icône du Dock seulement tant qu'une fenêtre est ouverte), ou la zone de notification.
2. Sur l'écran à relire, appuyer sur le raccourci : l'écran se fige.
3. Cliquer sur l'élément à corriger : la fenêtre est capturée et l'éditeur s'ouvre avec le point #1 posé, micro ouvert. Glisser encadre plutôt une zone (#1, un rectangle) sur la fenêtre ; ⌥ + glisser recadre la capture sur la zone, sans point.
4. Parler : « Ce bouton, radius de 8 px et un peu plus large. » Aucune validation.
5. Cliquer sur l'élément suivant : la dictée précédente part en transcription et un nouveau point s'ouvre. Répéter.
6. Si un dessin aide, le faire sur la tablette puis toucher « Envoyer » : il rejoint le point sélectionné.
7. Écran suivant : raccourci à nouveau, la session continue.
8. Revue terminée : ⌘E / Ctrl+E, puis glisser le PDF dans le chat de l'IA.

## 4. Application desktop (macOS et Windows)

L'application vit dans la barre de menus (Mac, icône du Dock tant qu'une fenêtre est ouverte) ou la zone de notification (Windows, l'éditeur fermé reste réduit dans la barre des tâches) et se résume à trois écrans : l'overlay de capture, l'éditeur et les réglages.

Priorités : **[M]** indispensable en V1, **[S]** souhaité en V1, **[C]** plus tard.

### 4.1 Session de revue

- **[M]** Une session = une revue = un PDF. Elle est créée automatiquement à la première capture si aucune n'est ouverte.
- **[M]** Nom par défaut « Revue AAAA-MM-JJ HHhMM », renommable d'un clic sur le titre.
- **[M]** Sauvegarde automatique à chaque modification. Une session interrompue (crash, fermeture) se rouvre intacte.
- **[S]** « Contexte du projet » (projet, stack, page testée), dans les réglages : repris par la session ouverte et les suivantes, et en tête du PDF.
- **[S]** Sessions récentes accessibles depuis l'icône, pour rouvrir ou réexporter.

### 4.2 Capture d'écran

- **[M]** Raccourci global configurable. Défaut : ⌃⌥⌘P (Mac) et Ctrl+Alt+P (Windows). Si l'enregistrement du raccourci échoue (déjà pris), l'app le signale et en demande un autre.
- **[M]** À l'appui, l'app masque ses fenêtres, fige tous les écrans et affiche un overlay plein écran en moins de 200 ms.
- Dans l'overlay :
    - **[M]** **Clic simple** : capture la cible sous le curseur, pose le point n°1 à l'endroit cliqué et lance la dictée. La cible est la fenêtre survolée **[S]**, à défaut l'écran entier du moniteur cliqué **[M]**.
    - **[M]** **Glisser** : capture la fenêtre qui contient le centre de la zone tracée (à défaut l'écran), avec la zone comme point n°1 (rectangle), et lance la dictée. **⌥ + glisser** : recadre sur la zone, sans point. La zone est mémorisée.
    - **[S]** **⇧ + clic** : réutilise la dernière zone tracée, dans le même mode, pour revoir plusieurs fois la même fenêtre de navigateur.
    - **[S]** **Survol** : la fenêtre sous le curseur est encadrée pour montrer ce que le clic va capturer.
    - **[M]** **Échap** : annule.
- **[M]** Capture en résolution physique (Retina, 150 %…), multi-écrans à échelles différentes inclus.
- **[S]** Relevé automatique du nom de l'application et du titre de la fenêtre (souvent le titre de la page web), repris dans le PDF.
- **[S]** Import d'une image par glisser-déposer ou Ctrl/⌘+V dans l'éditeur.

### 4.3 Éditeur d'annotations

- **[M]** S'ouvre au premier plan juste après la capture, image ajustée à la fenêtre. Molette = zoom, Espace maintenu + glisser = déplacement.
- **[M]** Disposition : la capture au centre ; à droite la liste des points de la capture (numéro, texte éditable, statut de transcription, vignette du croquis) ; en bas les vignettes des captures de la session ; en haut le nom de session, le compteur total de points, l'état de la tablette et le bouton Exporter.
- Types d'annotation, tous numérotés :
    - **[M]** **Point** : clic simple. Pastille ronde numérotée.
    - **[S]** **Zone** : glisser. Rectangle, pour « toute cette section ».
    - **[S]** **Flèche** : ⇧ + glisser, du départ vers l'arrivée, pour « déplace ce bouton ici ».
- **[M]** Numérotation continue sur toute la session (#1 à #N). Après une suppression, les numéros sont recalculés ; l'identifiant interne reste stable.
- **[M]** Glisser une pastille la déplace ; cliquer dessus la sélectionne et ouvre sa bulle.
- **[M]** La bulle s'affiche à côté du point : champ texte avec focus automatique, indicateur micro (onde et durée), statut « transcription… », vignette du croquis. Cliquer ailleurs la ferme ; le texte est déjà enregistré.

### 4.4 Commentaire : dictée et saisie

- **[M]** Mode par défaut « dictée automatique » : poser un point démarre l'enregistrement.
- **[M]** L'enregistrement s'arrête quand on pose un autre point, appuie sur Entrée, ou après un silence (3 s par défaut, réglable, désactivable). Échap l'annule et jette l'audio. Durée maximale : 60 s.
- **[M]** Taper une touche imprimable pendant l'enregistrement l'annule et bascule en saisie clavier.
- **[M]** L'audio part dans une file de transcription en arrière-plan. Le point affiche « … » puis le texte ; l'utilisateur continue sans attendre.
- **[M]** Re-dicter sur un point sélectionné (⌘M / Ctrl+M ou icône micro) ajoute le texte à la fin du commentaire existant.
- **[S]** Modes alternatifs dans les réglages : « appuyer pour parler » (touche maintenue) et « clavier seul ».
- **[S]** Conservation de l'audio de chaque point pour réécoute ou retranscription. L'audio n'est jamais mis dans le PDF.
- **[C]** Nettoyage du texte dicté par un LLM, désactivé par défaut car il peut altérer le sens.

### 4.5 Croquis côté desktop

- **[M]** Aucune action requise : la tablette dessine toujours pour le point sélectionné (voir section 5).
- **[M]** Un croquis reçu apparaît en vignette dans la bulle et dans la liste. Clic = agrandir ; suppression possible.
- **[S]** Plusieurs croquis par point.
- **[C]** Affichage en direct des traits pendant qu'on dessine.

### 4.6 Raccourcis

| Action | macOS | Windows |
| --- | --- | --- |
| Nouvelle capture (global) | ⌃⌥⌘P | Ctrl+Alt+P |
| Valider le texte, arrêter la dictée | Entrée | Entrée |
| Saut de ligne dans un commentaire | ⇧Entrée | Shift+Entrée |
| Annuler la dictée, fermer la bulle | Échap | Échap |
| Point suivant / précédent | Tab / ⇧Tab | Tab / Shift+Tab |
| Re-dicter sur le point sélectionné | ⌘M | Ctrl+M |
| Supprimer le point sélectionné (hors saisie) | ⌫ | Suppr |
| Annuler / rétablir | ⌘Z / ⌘⇧Z | Ctrl+Z / Ctrl+Y |
| Capture précédente / suivante | Page préc. / Page suiv. | Page préc. / Page suiv. |
| Exporter le PDF | ⌘E | Ctrl+E |

### 4.7 Icône et menu

- **[M]** Menu : Nouvelle session, Ouvrir l'éditeur, Exporter le PDF, Appairer une tablette (QR), Réglages, Quitter. Plus « Commenter un document… » (§4.10).
- **[S]** L'icône signale l'état : session active, nombre de points, tablette connectée, transcriptions en cours.
- Les mêmes entrées sont reprises dans le menu ≡ en haut à droite de l'éditeur (demandé le 7 oct. 2026).

### 4.8 Réglages

- **[M]** Raccourci global, mode de commentaire, délai de silence, langue de dictée (celle de l'interface par défaut), dossier d'export. Langue de l'interface (automatique : celle du système).
- **[S]** Moteur de transcription (Whisper local par défaut, API avec clé en secours), glossaire de vocabulaire, modèle du texte d'instructions du PDF, appareils appairés (révocation).

### 4.9 Premier lancement

- **[M]** Assistant d'autorisations : enregistrement d'écran (macOS), micro, puis téléchargement unique du modèle Whisper large-v3-turbo quantifié q5_0 (547 Mo) avec barre de progression.

### 4.10 Documents (demandé le 8 oct. 2026)

Un PDF, un Word, un Excel ou un PowerPoint s'ouvre dans l'app et se commente comme une capture.

- Ouverture :
  - par « Commenter un document… » (menu de l'icône et menu ≡) ;
  - par un bouton de l'éditeur (éditeur vide et bout des vignettes) ;
  - en déposant le fichier sur l'éditeur.
- Formats : .pdf, .docx/.docm/.dotx, .xlsx/.xlsm/.xltx, .pptx/.pptm/.potx. Les anciens formats (.doc, .xls, .ppt) et les fichiers protégés par mot de passe sont refusés avec un message.
- Le document devient une session nommée d'après le fichier, sauf si la session ouverte est vide. Comme pour la capture, un essai terminé bloque l'ouverture d'un nouveau document.
- Chaque page devient une capture :
  - une page de PDF ou de Word ;
  - une diapositive ;
  - un morceau de feuille Excel d'environ 50 lignes, avec ses en-têtes A, B, C et 1, 2, 3.

  Au-delà de 200 pages, seules les premières sont ouvertes.
- L'éditeur sert de visionneuse. La page est ajustée à la largeur, la molette la fait défiler et ⌘ / Ctrl + molette zoome. Points, zones, flèches, dictée, croquis et inspirations marchent comme sur une capture.
- Exports pour l'IA et MCP :
  - les pages sans point sont sautées ;
  - les titres sont du type « Page 3 / 12 — rapport.pdf », « Diapositive 4 / 20 — deck.pptx », « Feuille Ventes (A51:G100) — budget.xlsx » ;
  - chaque point cite ce qu'il vise : texte sous le point ou dans la zone, ou « cellule B51 de la feuille Ventes (« Magasin 50 ») » ;
  - instructions par défaut propres aux documents.
- **Copie commentée** (export « Copie commentée du document ») :
  - une copie de l'original reçoit les points au format du document : notes PDF à l'apparence de la pastille numérotée, commentaires Word autour des paragraphes visés, commentaires PowerPoint modernes à l'endroit du point, notes Excel sur les cellules ;
  - le texte est « #3 — commentaire », avec la mention des croquis et inspirations restés dans l'export VibeScreener ;
  - nom : « rapport (commenté).pdf » dans le dossier d'export. Aucun fichier n'est remplacé et l'original n'est jamais modifié.
- Rendu dans le processus principal, sans fenêtre :
  - PDF par pdf.js ;
  - Word et PowerPoint par `@silurus/ooxml` en mode Node ;
  - Excel par une grille dessinée par l'app à partir du classeur lu par cette bibliothèque.

  Polices Office : celles de Word quand il est installé, sinon des polices proches.
- Limites :
  - graphiques et images posés sur les feuilles Excel non dessinés ;
  - mise en page Word recalculée par la bibliothèque, donc parfois différente de Word ;
  - signature numérique d'un PDF invalidée dans la copie commentée.

## 5. PWA de croquis

La PWA est une toile plein écran pour dessiner au doigt ou au stylet ; un seul bouton envoie le croquis au point sélectionné sur le desktop.

### 5.1 Appairage

- **[M]** Le desktop affiche un QR code (menu « Appairer une tablette »). Le scanner ouvre la PWA déjà liée à cet ordinateur.
- **[M]** L'appairage est mémorisé des deux côtés. Les fois suivantes, la PWA se reconnecte seule à l'ouverture.
- **[M]** Installable sur l'écran d'accueil (iPadOS, Android), affichée sans barre d'adresse.

### 5.2 Écran unique

- **[M]** Bandeau haut : « Point #12 — début du texte… » (le point actif sur le desktop) et voyant de connexion. Sans point actif : « Aucun point sélectionné ».
- **[M]** Toile plein écran.
- **[M]** Barre d'outils à gros boutons (48 px minimum) : stylo, 3 couleurs (noir, rouge, bleu), 2 épaisseurs, gomme, annuler, effacer, choix du fond, Envoyer.
- **[M]** Fond blanc par défaut. **[S]** Fond quadrillé. **[S]** Fond « recadrage » : le zoom de la capture autour du point actif, pour dessiner par-dessus.
- **[M]** Le bouton « Envoyer », large, joint le croquis au point actif, vide la toile et confirme « Joint au point #12 ».
- **[M]** Sans point actif, le croquis est joint au dernier point créé ; s'il n'existe aucun point, « Envoyer » est désactivé.

### 5.3 Dessin

- **[M]** Pointer Events, lissage des traits, pression du stylet quand elle est disponible (Apple Pencil, stylets Android).
- **[M]** Rejet de la paume : dès qu'un stylet est détecté, le doigt ne dessine plus.
- **[S]** Tap à deux doigts = annuler.
- **[M]** Le croquis part en PNG (fond blanc) avec ses traits en JSON, pour une réédition future.
- **[C]** Rouvrir un croquis existant pour le modifier.
- **[C]** Mode miroir : les traits apparaissent en direct sur le desktop.

### 5.4 Limites

- Aucune autre fonction : pas de compte, pas de liste de sessions, pas de saisie de texte.
- Cibles : Safari sur iPadOS et Chrome sur Android, versions récentes.
- Hors connexion, la PWA s'ouvre mais affiche clairement qu'elle ne peut rien envoyer.

## 6. Export PDF pour l'IA

Le PDF est écrit pour être lu par une IA : du vrai texte, la liste complète dès la première page, et un zoom autour de chaque point. Les modèles repèrent mal une petite pastille dans une capture pleine page ; le recadrage lève l'ambiguïté.

### 6.1 Déclenchement

- **[M]** ⌘E / Ctrl+E ou bouton Exporter. Le PDF est enregistré dans le dossier d'export et révélé dans le Finder ou l'Explorateur.
- **[S]** Le fichier est aussi copié dans le presse-papiers, pour le coller directement dans le chat de l'IA.
- **[M]** Avertissement avant export si des transcriptions sont en cours ou en erreur.
- **[M]** Nom de fichier : `pastille-<nom-de-session>-<AAAAMMJJ-HHMM>.pdf`.

### 6.2 Structure du document

1. **En-tête** : nom de la session, date, contexte, nombre d'écrans et de points.
2. **Instructions à l'IA**, modèle modifiable dans les réglages (texte par défaut ci-dessous).
3. **Récapitulatif** : tableau texte de tous les points (numéro, écran, commentaire, croquis oui/non). L'IA a toute la liste avant les images.
4. **Un chapitre par écran** : titre « Écran 3 — Chrome — Tableau de bord », la capture entière avec toutes ses annotations dessinées, puis chaque point de l'écran :
    - numéro et commentaire en gros caractères ;
    - recadrage zoomé autour de l'annotation, pastille visible (zone = rectangle + marge, flèche = ses deux extrémités) ;
    - croquis éventuels ;
    - position en pixels sur la capture (x, y sur largeur × hauteur).

```markdown
Ce document liste {N} retours sur une interface, numérotés de #1 à #{N}.
Chaque retour indique un élément sur une capture d'écran : la pastille numérotée et le
recadrage montrent l'élément visé, un rectangle désigne une zone, une flèche un déplacement.
Applique chaque retour dans le code. Si un retour est ambigu, pose une question plutôt
que de deviner. À la fin, liste les numéros traités et ceux qui ne l'ont pas été.
```

### 6.3 Règles de rendu

- **[M]** Texte sélectionnable, jamais rasterisé.
- **[M]** Images en JPEG qualité ~80 ; captures limitées à 2000 px de large ; recadrages d'environ 600 × 400 px.
- **[M]** A4 paysage ; un point n'est jamais coupé entre deux pages.
- **[M]** Le dessin des annotations est identique à celui de l'éditeur (même fonction de rendu).
- **[S]** Au-delà de 100 pages ou 30 Mo, découpage automatique en parties (« partie 1/3 »), car plusieurs assistants IA plafonnent la taille des PDF acceptés.
- **[S]** Export alternatif « dossier Markdown + images » (`revue.md` + `images/`), plus efficace quand l'IA lit directement les fichiers, comme Claude Code.

## 7. Architecture technique

Un monorepo TypeScript à trois applications — desktop Electron, PWA, relais — qui partagent un paquet commun de types, protocole, chiffrement et rendu.

> *[Schéma « architecture · desktop, relais, tablette » : voir le cahier des charges en ligne]*

Le processus principal centralise la logique : les fenêtres affichent, whisper.cpp transcrit, et le relais transmet des messages qu'il ne peut pas lire.

| Brique | Choix | Raison |
| --- | --- | --- |
| Desktop | Electron + React + Vite | Raccourcis globaux, icône système, overlay transparent et génération PDF disponibles nativement ; tout en TypeScript |
| Capture | `desktopCapturer` d'Electron ; si trop lent au POC, module natif (ScreenCaptureKit sur macOS, Windows.Graphics.Capture) | Pleine résolution sur tous les écrans |
| Détection des fenêtres | Module natif type `get-windows`, sinon petit helper (CGWindowList sur macOS, EnumWindows sur Windows) | Electron ne donne pas la position des fenêtres des autres applications |
| Audio | Web Audio API + AudioWorklet, PCM 16 kHz mono | Format attendu par Whisper, sans ffmpeg |
| Transcription | whisper.cpp en processus enfant, modèle large-v3-turbo quantifié q5_0 (547 Mo), le même sur Mac et PC, téléchargé une fois au premier lancement ; API cloud en option | Gratuit, hors ligne, bon en français ; un prompt initial nourri du glossaire UI fiabilise le jargon |
| PDF | Page HTML générée puis `webContents.printToPDF` | Mise en page CSS, texte sélectionnable, sauts de page maîtrisés |
| PWA | Vite + React + vite-plugin-pwa ; canvas, Pointer Events, lissage type perfect-freehand | Installable, légère, pression du stylet |
| Relais | Cloudflare Worker + Durable Object (WebSocket) ; PWA hébergée sur Cloudflare Pages | Quelques dizaines de lignes, coût quasi nul, faible latence |
| Chiffrement | WebCrypto AES-GCM | Disponible dans Node comme dans le navigateur |
| Packaging | electron-builder | `.dmg` et `.exe`, signature, mise à jour automatique |

```text
pastille/
├─ apps/
│  ├─ desktop/   Electron : main, preload, fenêtres React
│  ├─ pwa/       PWA de croquis
│  └─ relay/     Worker Cloudflare (WebSocket)
├─ packages/
│  └─ shared/    types, protocole, chiffrement, rendu des annotations
└─ docs/SPEC.md
```

## 8. Données, stockage et synchronisation

Tout est stocké en local, en fichiers lisibles, un dossier par session ; seuls le point actif et le croquis transitent par le relais, chiffrés de bout en bout.

### 8.1 Stockage

```text
<dossier données de l'app>/sessions/<sessionId>/
  session.json                 état complet de la session
  captures/<captureId>.png     captures en pleine résolution
  captures/<captureId>.json    page de document : carte du texte (morceaux, paragraphes Word, cellules Excel)
  documents/<documentId>.<ext> document ouvert dans l'app : copie intacte de l'original
  audio/<annotationId>.wav     dictées (PCM 16 kHz mono)
  sketches/<sketchId>.png      croquis
  sketches/<sketchId>.json     traits vectoriels
  exports/                     PDF générés
```

- **[M]** Écriture atomique de `session.json` (fichier temporaire puis renommage), avec un anti-rebond d'environ 300 ms.
- **[M]** La file de transcription est persistée : après un redémarrage, les dictées en attente repartent. Une erreur conserve l'audio et propose « Réessayer ».

### 8.2 Modèle (TypeScript, dans `packages/shared`)

```ts
type Session = {
  id: string; name: string; context?: string;
  createdAt: string; updatedAt: string;
  captures: Capture[];
};

type Capture = {
  id: string; createdAt: string;
  image: string;                 // chemin relatif au dossier de session
  width: number; height: number; // pixels physiques
  scaleFactor: number;
  source?: { app?: string; windowTitle?: string; displayId?: string; document?: DocumentPage };
  annotations: Annotation[];
};

// Page d'un document ouvert dans l'app (§4.10)
type DocumentPage = {
  id: string; name: string;      // documents/<id>.<ext>, « rapport.docx »
  format: 'pdf' | 'docx' | 'xlsx' | 'pptx';
  page: number; pages: number;   // page, diapositive ou morceau de feuille
  sheet?: string; range?: string; // Excel : « Ventes », « A1:G50 »
};

// Coordonnées normalisées 0–1, relatives à l'image
type Geometry =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'zone'; x: number; y: number; w: number; h: number }
  | { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number };

type Annotation = {
  id: string;                    // stable
  number: number;                // affiché, recalculé sur toute la session
  geometry: Geometry;
  text: string;
  input: 'typed' | 'dictated' | 'mixed';
  audio?: string;
  transcription: 'none' | 'recording' | 'pending' | 'done' | 'error';
  sketches: Sketch[];
  createdAt: string; updatedAt: string;
};

type Sketch = { id: string; png: string; strokes: string; createdAt: string };
```

### 8.3 Synchronisation desktop ↔ tablette

- **Transport** : WebSocket vers un relais, une « room » par appairage. Le desktop et la PWA s'y connectent tous deux en sortie : aucun port à ouvrir, fonctionne sur tout réseau.
- **Appairage** : le QR encode `https://<domaine-pwa>/#r=<roomId>&k=<clé>`. Le fragment après `#` n'est jamais envoyé au serveur.
- **Chiffrement** : la clé AES-GCM 256 bits du QR chiffre chaque message (WebCrypto des deux côtés). Le relais ne voit que du chiffré.
- **Reconnexion** automatique avec attente progressive. À chaque reconnexion, le desktop renvoie le point actif.
- **Attachement sans ambiguïté** : la tablette envoie l'id du point qu'elle affichait. Le desktop attache le croquis à ce point, même si la sélection a changé entre-temps.
- **Taille** : message de 1 Mo maximum ; recadrage de fond de 200 Ko maximum.

| Sens | Message | Contenu |
| --- | --- | --- |
| desktop → tablette | `focus` | id, numéro et début du texte du point actif ; recadrage JPEG optionnel pour le fond |
| desktop → tablette | `focus_none` | aucun point sélectionné |
| tablette → desktop | `sketch` | id du point visé, PNG, traits JSON |
| desktop → tablette | `sketch_ack` | id du croquis reçu, numéro du point |
| les deux | `hello`, `ping` | présence et état de connexion |
| tablette → desktop | `strokes_live` **[C]** | traits en cours, pour le mode miroir |

## 9. Exigences non fonctionnelles

L'outil doit paraître instantané, ne jamais perdre une note et ne rien envoyer en clair hors de la machine.

| Mesure | Cible |
| --- | --- |
| Raccourci → overlay affiché | moins de 200 ms |
| Clic dans l'overlay → éditeur prêt | moins de 500 ms |
| Pose d'un point → micro actif | moins de 100 ms |
| Transcription locale de 5 s d'audio, Mac Apple Silicon | moins de 2 s |
| Transcription locale de 5 s d'audio, PC récent sans GPU dédié | moins de 5 s |
| « Envoyer » sur tablette → croquis visible sur desktop | moins de 500 ms |
| Export PDF de 50 écrans et 300 points | moins de 20 s |
| Mémoire au repos (icône seule) | moins de 250 Mo |

- **Systèmes** : macOS 13 ou plus récent (Apple Silicon et Intel), Windows 10 et 11 (x64).
- **Écrans** : HiDPI, plusieurs moniteurs à échelles différentes, thèmes clair et sombre.
- **Fiabilité** : aucune perte de données en cas de crash ou de coupure ; sauvegarde continue.
- **Confidentialité** : transcription locale par défaut ; le relais ne voit que des messages chiffrés ; aucune télémétrie.
- **Langue** : app, exports, MCP, PWA et site en français, anglais, espagnol, allemand et italien ; textes externalisés dans un dictionnaire par langue.
- **Distribution** : `.dmg` pour Mac (signé et notarisé si un compte Apple Developer est disponible), installeur `.exe` pour Windows. **[C]** Mise à jour automatique.

## 10. Lots, POC et critères d'acceptation

Le développement commence par trois POC qui lèvent les risques techniques, puis quatre lots, chacun utilisable en vrai dès sa livraison.

### Lot 0 — POC (à valider avant tout le reste)

1. **Capture** : overlay figé multi-écrans et détection de la fenêtre sous le curseur, sur Mac et Windows.
    - Critère : une fenêtre Chrome capturée en 1 raccourci + 1 clic, en résolution physique, sans aucune fenêtre de l'app dans l'image.
2. **Dictée** : enregistrement PCM 16 kHz dans l'interface et transcription whisper.cpp locale avec le modèle large-v3-turbo q5_0.
    - Critère : 5 s de français transcrites en moins de 2 s sur Mac Apple Silicon et en moins de 5 s sur le PC Windows cible, vocabulaire UI correct (« border-radius », « padding », « header »).
3. **Synchro** : relais WebSocket et PWA sur une vraie tablette.
    - Critère : aller-retour chiffré desktop → tablette → desktop en moins de 300 ms, en Wi-Fi comme en 4G.

### Lot 1 — Boucle de base, au clavier

- Session, raccourci global, overlay (zone et écran entier), éditeur avec points, saisie clavier, numérotation, sauvegarde automatique, export PDF.
- Critère : 20 points sur 5 captures en moins de 3 minutes au clavier. Le PDF donné à Claude lui permet de restituer les 20 retours sans erreur de numéro ni d'élément.

### Lot 2 — Dictée et vitesse

- Dictée automatique, file de transcription, capture de fenêtre, clic overlay = capture + point n°1, zones et flèches, raccourcis complets, annuler/rétablir.
- Critère : 30 retours dictés en moins de 5 minutes, un seul clic par retour, aucun temps d'attente perçu.

### Lot 3 — Tablette

- Relais, appairage par QR, PWA, croquis joint au point actif, fond « recadrage ».
- Critère : croquis visible sur le desktop moins de 500 ms après « Envoyer » ; reconnexion automatique après la mise en veille de la tablette.

### Lot 4 — Finition

- Assistant de premier lancement, réglages complets, découpage du PDF, export Markdown, moteur de transcription API optionnel, installeurs signés.
- Critère : installation sur une machine vierge, Mac et PC, en moins de 5 minutes modèle compris.

## 11. Décisions ouvertes et hors périmètre

La transcription est tranchée : Whisper en local. Les trois autres choix structurants ont une recommandation par défaut ; Claude Code l'applique sauf contre-indication découverte au POC.

| Sujet | Recommandation | Alternative et compromis |
| --- | --- | --- |
| Framework desktop | Electron + TypeScript | Tauri : binaire bien plus léger, mais capture, audio et Whisper à écrire en Rust |
| Transcription | Décidé : whisper.cpp local, modèle large-v3-turbo quantifié q5_0 (547 Mo) ; API cloud en secours | API seule : plus simple et plus rapide sur PC modeste, mais payante et l'audio quitte la machine |
| Synchro tablette | Relais cloud chiffré de bout en bout | Serveur sur le Wi-Fi local : rien dans le cloud, mais une PWA exige un HTTPS valide pour s'installer, difficile en réseau local |
| Signature macOS | Compte Apple Developer (abonnement annuel) | App non signée : alerte Gatekeeper, et l'autorisation d'enregistrement d'écran risque d'être redemandée à chaque nouvelle version |

**Questions à trancher**

- Quelle tablette : iPad avec Apple Pencil, Android, ou les deux ? Cela oriente la gestion de la pression et du rejet de paume.
- Faut-il un usage sans internet (train, réseau d'entreprise qui filtre les WebSockets) ? Si oui, le mode Wi-Fi local passe en V1.

**Hors périmètre V1** : comptes et collaboration, Linux, annotation de vidéo (ajoutée ensuite sous forme de mode vidéo sans fichier vidéo, voir `ROADMAP.md`), retouche d'image (flou, recadrage manuel), envoi direct à une API d'IA, intégration Jira ou GitHub.

**Évolution à fort potentiel [C]** : un serveur MCP local exposant la session ouverte. Claude Code lirait alors les retours et les images sans passer par un PDF, et pourrait cocher lui-même les points traités.

## 12. Consignes pour Claude Code

Travailler lot par lot, en commençant par les POC, et montrer des résultats mesurés avant d'avancer.

1. Lire ce document en entier. Le copier dans le dépôt en `docs/SPEC.md` et créer un `CLAUDE.md` court : stack, commandes, conventions.
2. Réaliser les trois POC du lot 0 et présenter leurs mesures (latences, qualité de transcription) avant de lancer le lot 1.
3. Respecter les priorités [M], [S], [C]. Toute fonctionnalité non listée est proposée, jamais ajoutée d'office.
4. TypeScript strict partout. Types, protocole et chiffrement vivent dans `packages/shared`, utilisé par le desktop, la PWA et le relais.
5. Une seule fonction de rendu des annotations (pastilles, zones, flèches), utilisée par l'éditeur, le PDF et le fond de la PWA.
6. Toute la logique dans le processus principal Electron ; les fenêtres ne font que l'affichage et dialoguent par IPC typé.
7. Tests unitaires sur le modèle, la numérotation, le protocole et le chiffrement. Un test de bout en bout génère une session factice et vérifie le PDF produit.
8. README : installation, autorisations macOS et Windows, téléchargement du modèle, déploiement du relais.
9. Signaler toute limite de plateforme rencontrée (API de capture, autorisations, raccourci déjà pris) au lieu de la contourner en silence.
10. Pour chaque décision ouverte de la section 11, appliquer la recommandation sauf contre-indication argumentée.
