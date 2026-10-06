// Textes de l'interface, regroupés par fenêtre pour une traduction future (français pour l'instant).

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

export const T = {
  plural,
  points: (n: number) => plural(n, 'point'),
  screens: (n: number) => plural(n, 'écran'),
  transcriptions: (n: number) => plural(n, 'transcription'),

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

  editor: {
    rename: 'Renommer la session',
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
    newCapture: 'Nouvelle capture',
    emptyTitle: "Aucune capture pour l'instant",
    emptyBefore: "Sur l'écran à relire, appuyez sur",
    emptyAfter: "puis cliquez sur l'élément à corriger.",
    micError: (err: unknown) => `Micro indisponible : ${err}`,
    sketchZoomed: 'Croquis agrandi',
  },
};
