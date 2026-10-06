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
};
