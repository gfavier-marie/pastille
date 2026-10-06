// Règles du modèle partagées : création de session, numérotation continue.

import type { Annotation, Session } from './model.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/** « Revue AAAA-MM-JJ HHhMM » (cahier des charges §4.1). */
export function defaultSessionName(d: Date): string {
  return `Revue ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

export function newSession(now: Date, context?: string): Session {
  const iso = now.toISOString();
  return { id: crypto.randomUUID(), name: defaultSessionName(now), context, createdAt: iso, updatedAt: iso, captures: [] };
}

/** Toutes les annotations dans l'ordre de lecture : captures, puis ordre de création. */
export function allAnnotations(session: Session): Annotation[] {
  return session.captures.flatMap((c) => c.annotations);
}

/** Numérotation continue #1 à #N sur toute la session ; les identifiants ne changent pas. */
export function renumber(session: Session): void {
  allAnnotations(session).forEach((a, i) => (a.number = i + 1));
}

export function findAnnotation(session: Session, id: string) {
  for (const capture of session.captures) {
    const annotation = capture.annotations.find((a) => a.id === id);
    if (annotation) return { capture, annotation };
  }
  return undefined;
}

/** Nom de fichier sans accents ni caractères spéciaux. */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'revue'
  );
}

/** AAAAMMJJ-HHMM, pour les noms de fichiers d'export. */
export function stamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
