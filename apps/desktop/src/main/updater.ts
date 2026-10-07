// Mises à jour (app installée) : la dernière version publiée (latest.json, écrit par la CI au tag,
// sur le bucket R2 des téléchargements) est comparée à celle de l'app. « Mettre à jour » montre la
// commande d'installation du site, à coller dans un terminal : le script ferme l'app, la remplace et
// la rouvre. Sans signature Apple, macOS redemande ensuite l'enregistrement de l'écran, le micro et
// l'Accessibilité (limite de plateforme, voir install.sh). PASTILLE_DOWNLOADS vise un autre bucket (essais).

import { SITE_URL } from './license.ts';

const DOWNLOADS = process.env.PASTILLE_DOWNLOADS ?? 'https://dl.vibescreener.dev'; // domaine provisoire (M0)

export type Update = { version: string };

/** « 0.10.0 » est plus récente que « 0.9.2 ». */
export function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** La dernière version si elle est plus récente que `current`, sinon null. Hors ligne, serveur en
 *  erreur ou sans réponse en 15 s : une erreur, et l'appelant garde ce qu'il savait. */
export async function checkForUpdate(current: string): Promise<Update | null> {
  const res = await fetch(`${DOWNLOADS}/latest.json`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`latest.json : HTTP ${res.status}`);
  const { version } = (await res.json()) as { version: string };
  return isNewer(version, current) ? { version } : null;
}

/** Commande d'installation du site, la même que sur la page d'accueil, et le terminal où la coller. */
export function updateCommand(platform: NodeJS.Platform): { command: string; terminal: string } {
  return platform === 'win32'
    ? { command: `irm ${SITE_URL}/install.ps1 | iex`, terminal: 'PowerShell' }
    : { command: `curl -fsSL ${SITE_URL}/install.sh | sh`, terminal: 'Terminal' };
}

/** Au lancement qui suit une mise à jour lancée par une version antérieure à la 0.13.0 (téléchargée
 *  par l'app) : réussie si l'app est au moins à cette version. */
export function updateOutcome(updatingTo: string, version: string): 'done' | 'failed' | null {
  if (!updatingTo) return null;
  return isNewer(updatingTo, version) ? 'failed' : 'done';
}
