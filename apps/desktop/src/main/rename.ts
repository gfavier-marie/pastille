// Renommage qui insiste : sous Windows, un fichier tout juste écrit reste parfois ouvert un instant
// par un autre processus (antivirus, indexation) et le renommer échoue (EPERM, EBUSY). Vu sur la CI.

import { rename } from 'node:fs/promises';

export async function renameRetry(from: string, to: string) {
  for (let i = 1; ; i++) {
    try {
      return await rename(from, to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (i >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(code)) throw err;
      await new Promise((r) => setTimeout(r, 50 * i)); // jusqu'à ~10 s en tout (analyse d'un gros fichier)
    }
  }
}
