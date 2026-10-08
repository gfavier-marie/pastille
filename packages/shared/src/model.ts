// Modèle de données d'une session de revue (cahier des charges §8.2).

export type Session = {
  id: string;
  name: string;
  context?: string;
  notes?: Note[]; // remarques générales, rattachées à aucun point
  createdAt: string;
  updatedAt: string;
  captures: Capture[];
};

export type Capture = {
  id: string;
  createdAt: string;
  image: string; // chemin relatif au dossier de session
  width: number; // pixels physiques
  height: number;
  scaleFactor: number;
  source?: { app?: string; windowTitle?: string; displayId?: string; document?: DocumentPage };
  annotations: Annotation[];
};

export type DocumentFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx';

/** Page d'un document ouvert dans l'app : la capture en est le rendu, l'original est copié dans documents/<id>.<ext>. */
export type DocumentPage = {
  id: string;
  name: string; // « rapport.pdf »
  format: DocumentFormat;
  page: number; // à partir de 1 : page, diapositive ou feuille (bande d'une très grande feuille)
  pages: number; // pages ouvertes
  sheet?: string; // Excel : nom de la feuille
  range?: string; // Excel : cellules de la page (« A1:L120 »)
};

// Coordonnées normalisées 0–1, relatives à l'image
export type Geometry =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'zone'; x: number; y: number; w: number; h: number }
  | { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number };

export type Annotation = {
  id: string; // stable
  number: number; // affiché, recalculé sur toute la session
  geometry: Geometry;
  text: string;
  input: 'typed' | 'dictated' | 'mixed';
  audio?: string;
  transcription: 'none' | 'recording' | 'pending' | 'done' | 'error';
  sketches: Sketch[];
  inspirations?: Inspiration[]; // captures d'autres sites : le résultat souhaité pour ce point
  createdAt: string;
  updatedAt: string;
};

export type Sketch = { id: string; png: string; strokes: string; createdAt: string };

/** Image modèle d'un point (autre site, autre app) : capturée au raccourci, collée ou déposée. */
export type Inspiration = { id: string; image: string; createdAt: string; source?: { app?: string; windowTitle?: string } };

/** Remarque générale : un commentaire sans point, tapé ou dicté comme celui d'un point. */
export type Note = Pick<Annotation, 'id' | 'text' | 'input' | 'audio' | 'transcription' | 'createdAt' | 'updatedAt'>;
