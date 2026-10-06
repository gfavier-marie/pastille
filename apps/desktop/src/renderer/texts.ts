// Textes de l'interface, regroupés par fenêtre pour une traduction future (français pour l'instant).

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');

/** « aujourd'hui », « hier » ou « 3 oct. ». */
function day(iso: string) {
  const d = new Date(iso);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  return new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short' }).format(d);
}

/** « depuis 18 min », « depuis 2 h », « depuis hier ». */
function since(iso: string) {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "depuis à l'instant";
  if (min < 60) return `depuis ${min} min`;
  if (min < 24 * 60) return `depuis ${Math.floor(min / 60)} h`;
  const d = day(iso);
  return d === 'hier' ? 'depuis hier' : `depuis le ${d}`;
}

export const T = {
  plural,
  day,
  since,
  points: (n: number) => plural(n, 'point'),
  screens: (n: number) => plural(n, 'écran'),
  transcriptions: (n: number) => plural(n, 'transcription'),
  reveal: isMac ? 'Afficher dans le Finder' : "Afficher dans l'Explorateur",

  menu: {
    label: 'VibeScreener',
    noSession: 'Aucune session ouverte',
    noSessionHint: 'La prochaine capture en ouvre une.',
    tablet: 'Tablette connectée',
    capture: 'Nouvelle capture',
    editor: "Ouvrir l'éditeur",
    exportPdf: 'Exporter le PDF',
    newSession: 'Nouvelle session',
    recents: 'Sessions récentes',
    allSessions: 'Toutes les sessions…',
    reexport: (name: string) => `Réexporter le PDF de ${name}`,
    pair: 'Appairer une tablette…',
    claudeCode: 'Brancher Claude Code…',
    settings: 'Réglages…',
    quit: 'Quitter VibeScreener',
    update: (version: string) => `Mettre à jour (version ${version})`,
    pending: (n: number) => `${plural(n, 'transcription')} en cours`,
    errors: (n: number) => `${plural(n, 'transcription')} en erreur`,
  },

  bar: {
    label: 'Session VibeScreener',
    capture: 'Capturer',
    newCapture: 'Nouvelle capture',
    editor: "Ouvrir l'éditeur",
    exportPdf: 'Exporter le PDF',
    hide: 'Masquer la barre',
    tablet: 'Tablette',
    exported: { pdf: 'PDF exporté', markdown: 'Dossier Markdown exporté', pptx: 'PowerPoint exporté' },
    copied: 'PDF copié dans le presse-papiers',
  },

  overlay: {
    hints: [
      ['Clic', 'capture la fenêtre et pose le point {n}'],
      ['Glisser', 'zone'],
      ['⇧ Clic', 'dernière zone'],
      ['Échap', 'annuler'],
    ] as [string, string][],
    wholeScreen: 'Écran entier',
    zone: 'Zone',
    screen: (session: string, index: number) => `${session} · écran ${index}`,
  },

  settings: {
    tabs: { general: 'Général', transcription: 'Transcription', export: 'Export PDF', devices: 'Appareils', claude: 'Claude Code' },
    capture: 'Capture',
    shortcut: 'Raccourci de capture',
    shortcutAria: (label: string) => `Modifier le raccourci, actuellement ${label}`,
    shortcutListening: 'Tapez la combinaison…',
    shortcutHint: isMac
      ? 'Évite ⇧⌘3, ⇧⌘4 et ⇧⌘5, réservés par macOS. Cliquez puis tapez la nouvelle combinaison.'
      : 'Cliquez puis tapez la nouvelle combinaison.',
    shortcutTaken: 'Ce raccourci est indisponible : choisissez-en un autre.',
    comment: 'Commentaire',
    mode: 'Mode',
    modes: { auto: 'Dictée auto', push: 'Appuyer pour parler', keyboard: 'Clavier seul' },
    modeHints: {
      auto: 'Poser un point ouvre le micro.',
      push: `Maintenez ${isMac ? '⌥' : 'Alt'} pour dicter sur le point sélectionné.`,
      keyboard: 'Pas de micro : le commentaire se tape.',
    },
    silence: 'Arrêter la dictée après un silence de',
    silenceSwitch: 'Arrêt sur silence',
    less: 'Moins',
    more: 'Plus',
    seconds: (s: number) => `${s} s`,
    language: 'Langue de dictée',
    languages: { fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', it: 'Italien', auto: 'Détection automatique' } as Record<string, string>,
    export: 'Export',
    exportDir: "Dossier d'export",
    choose: 'Choisir…',
    copyPdf: "Copier le PDF dans le presse-papiers après l'export",
    app: 'VibeScreener',
    openAtLogin: `Ouvrir VibeScreener au démarrage ${isMac ? 'du Mac' : 'de l’ordinateur'}`,
    floatingBar: 'Barre flottante pendant une session',
    floatingBarHint: "Compteur de points, capture et export, toujours à portée de main.",
    engine: 'Moteur',
    engines: { local: 'Whisper local', api: 'API avec clé' },
    engineHints: {
      local: "Gratuit, hors ligne : l'audio ne quitte pas cet ordinateur.",
      api: "Secours : l'audio est envoyé au service choisi.",
    },
    model: 'Whisper large-v3-turbo',
    modelDetail: 'Quantifié q5_0 · 547 Mo',
    modelState: { ready: 'Prêt', loading: 'Chargement…', missing: 'Non téléchargé', error: 'Erreur' },
    download: 'Télécharger',
    apiUrl: "Adresse de l'API (compatible OpenAI)",
    apiModel: 'Modèle',
    apiKey: 'Clé',
    apiKeySaved: 'enregistrée',
    save: 'Enregistrer',
    glossary: 'Glossaire',
    glossaryHint: 'Vocabulaire à bien reconnaître (noms de composants, jargon du projet).',
    instructions: "Instructions à l'IA",
    instructionsHint: 'En tête du PDF, du Markdown et de la revue lue par Claude Code. {N} est remplacé par le nombre de retours.',
    claudeCode: 'Claude Code',
    claudeCodeCommand: 'Pour le brancher, lancez une fois cette commande dans un terminal :',
    claudeCodeHint:
      'Claude Code lit alors vos revues (sessions, retours, captures annotées) tant que VibeScreener est lancée. Demandez-lui par exemple « applique la revue VibeScreener ».',
    claudeCodeOff: 'Serveur pour Claude Code non démarré.',
    claudeCodeSeen: (iso: string) =>
      `Connecté ${day(iso)} à ${new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))}`,
    claudeCodeNever: 'Pas encore connecté',
    copy: 'Copier',
    copied: 'Copié',
    tablet: 'Tablette',
    tabletPaired: 'Tablette appairée',
    tabletNone: 'Aucune tablette appairée',
    tabletConnected: 'Connectée',
    tabletOffline: 'Hors ligne',
    tabletHint: 'Une tablette dessine les croquis du point sélectionné. Le lien est chiffré de bout en bout.',
    showQr: 'Afficher le QR',
    pair: 'Appairer…',
    revoke: 'Révoquer',
  },

  welcome: {
    step: (n: number) => `Étape ${n} sur 3`,
    continue: 'Continuer',
    back: 'Retour',
    finish: 'Terminer',
    permissions: {
      title: isMac ? 'Deux autorisations pour commencer' : 'Une autorisation pour commencer', // Windows : micro seulement
      intro: "VibeScreener capture la fenêtre que vous relisez et écoute vos commentaires. Les images et l'audio restent sur cet ordinateur.",
      screen: "Enregistrement de l'écran",
      screenWhy: 'Pour capturer la fenêtre à relire en pleine résolution.',
      mic: 'Microphone',
      micWhy: 'Pour dicter un commentaire à chaque point posé.',
      granted: 'Autorisée',
      allow: 'Autoriser',
      relaunch: "macOS peut demander de relancer VibeScreener après l'autorisation d'écran : cet assistant se rouvrira.",
      keyboardOnly: 'Pas de micro ? Passer en clavier seul',
      keyboardChosen: 'Clavier seul : le micro ne sera pas utilisé.',
    },
    model: {
      title: 'Le modèle de dictée se télécharge',
      titleReady: 'Le modèle de dictée est prêt',
      intro: "Whisper transcrit sur cet ordinateur, sans connexion ni abonnement. Ce téléchargement n'a lieu qu'une fois.",
      name: 'Whisper large-v3-turbo',
      detail: 'Quantifié q5_0 · 547 Mo · bon en français',
      progress: (percent: number) => `${Math.round((percent * 547) / 100)} Mo sur 547 Mo`,
      ready: 'Prêt',
      retry: 'Réessayer',
      note: "Vous pouvez continuer sans attendre. La saisie au clavier marche déjà ; la dictée s'activera seule à la fin du téléchargement.",
      useApi: 'Utiliser plutôt une API avec clé',
      apiChosen: 'Transcription par API : la clé se règle dans les réglages.',
    },
    shortcut: {
      title: 'Essayez le raccourci',
      intro: (keys: number) =>
        `Ouvrez la page à relire, puis appuyez sur ${keys > 2 ? 'ces trois touches' : 'ce raccourci'}. Ensuite, VibeScreener se range dans ${isMac ? 'la barre de menus' : 'la zone de notification'}.`,
      waiting: "En attente de l'appui…",
      steps: [
        ['Raccourci', "L'écran se fige."],
        ["Clic sur l'élément", "Le point est posé, le micro s'ouvre."],
        ['Parlez', "Puis cliquez l'élément suivant."],
      ] as [string, string][],
      openAtLogin: `Ouvrir VibeScreener au démarrage ${isMac ? 'du Mac' : 'de l’ordinateur'}`,
      other: 'Choisir un autre raccourci',
    },
  },

  pairing: {
    title: 'Scannez ce code avec la tablette',
    qr: "Code QR d'appairage",
    waiting: 'En attente de la tablette…',
    connected: 'Tablette connectée',
    steps: [
      "Ouvrez l'appareil photo de la tablette et visez le code.",
      "Touchez le lien, puis Partager › Sur l'écran d'accueil pour l'installer.",
      "C'est fait : la tablette se reconnectera seule à chaque ouverture.",
    ],
    secure: "Chiffré de bout en bout. La clé est dans le code et ne passe jamais par le serveur : ne le montrez qu'à votre tablette.",
    devices: 'Appareils appairés',
    tablet: 'Tablette',
    online: 'Connectée',
    revoke: 'Révoquer',
    revokeHint: 'Un nouveau code est créé : la tablette devra le scanner à nouveau.',
  },

  editor: {
    rename: 'Renommer la session',
    sessions: 'Sessions',
    allSessions: 'Toutes les sessions',
    noSessions: 'Aucune session enregistrée.',
    sessionOpen: 'ouverte',
    openSession: (name: string) => `Ouvrir ${name}`,
    exportSession: (name: string) => `Exporter le PDF de ${name}`,
    trashSession: (name: string) => `Mettre ${name} à la corbeille`,
    close: 'Fermer',
    context: 'Contexte',
    contextEmpty: 'projet, stack, page testée',
    tablet: 'Tablette connectée',
    export: 'Exporter',
    formats: { pdf: "PDF pour l'IA", markdown: 'Dossier Markdown + images', pptx: 'PowerPoint (présentation)' },
    exporting: { pdf: 'Export du PDF…', markdown: 'Export Markdown…', pptx: 'Export PowerPoint…' },
    exported: (path: string) => `Exporté : ${path}`,
    stageHints: [
      ['Clic', 'point'],
      ['Glisser', 'zone'],
      ['⇧ Glisser', 'flèche'],
    ] as [string, string][],
    zoomOut: 'Zoom arrière',
    zoomIn: 'Zoom avant',
    screenTitle: (index: number, points: number) => `Écran ${index} · ${plural(points, 'point')}`,
    previous: 'Capture précédente',
    next: 'Capture suivante',
    noPoints: 'Cliquez sur la capture pour poser un point.',
    undoAll: (mod: string) => `${mod}Z annule tout, même une suppression`,
    notes: 'Remarques générales',
    note: 'Remarque',
    addNote: 'Ajouter une remarque',
    notesHint: 'sans point précis',
    notePlaceholder: 'Votre remarque…',
    dictateNote: 'Dicter la suite',
    dictateMore: (mod: string) => `Dicter la suite (${mod}M)`,
    keyDictate: (mod: string) => [`${mod}M`, 'dicte la suite'] as [string, string],
    stopDictation: 'Arrêter la dictée',
    deleteNote: 'Supprimer la remarque',
    kinds: { point: 'Point', zone: 'Zone', arrow: 'Flèche' },
    dictated: 'Dicté',
    typed: 'Tapé',
    transcribing: 'transcription…',
    transcriptionError: 'Transcription en erreur',
    retry: 'Réessayer',
    recording: 'Dictée en cours',
    tabletDraws: 'la tablette dessine pour ce point',
    sketches: (n: number) => `${plural(n, 'croquis', 'croquis')} · tablette`,
    zoomSketch: 'Agrandir le croquis',
    deleteSketch: 'Supprimer le croquis',
    deletePoint: 'Supprimer le point',
    noComment: 'Sans commentaire',
    bubbleLabel: (n: number) => `Commentaire du point ${n}`,
    placeholderRecording: 'Parlez, ou tapez pour écrire…',
    placeholder: 'Votre commentaire…',
    sketchHint: 'Croquis : dessinez sur la tablette',
    keys: [
      ['Entrée', 'valide'],
      ['Échap', 'annule'],
    ] as [string, string][],
    keyToType: ['une touche', 'passe au clavier'] as [string, string],
    thumb: (index: number, first?: number, last?: number) =>
      `Écran ${index} · ${first === undefined ? 'aucun point' : first === last ? `#${first}` : `#${first}–${last}`}`,
    thumbLabel: (index: number, points: number, current: boolean) =>
      `Écran ${index}, ${plural(points, 'point')}${current ? ', affiché' : ''}`,
    captures: 'Captures de la session',
    deleteScreen: (index: number) => `Supprimer l'écran ${index} et ses points`,
    screenDeleted: (index: number, mod: string) => `Écran ${index} supprimé · ${mod}Z pour annuler`,
    newCapture: 'Nouvelle capture',
    emptyTitle: "Aucune capture pour l'instant",
    emptyBefore: "Sur l'écran à relire, appuyez sur",
    emptyAfter: "puis cliquez sur l'élément à corriger.",
    micError: (err: unknown) => `Micro indisponible : ${err}`,
    sketchZoomed: 'Croquis agrandi',
  },
};
