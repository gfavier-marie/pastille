// Mises à jour (Mac, app installée) : la dernière Release GitHub est comparée à la version de
// l'app. « Mettre à jour » lance l'install.sh de cette Release, détaché : il télécharge le .dmg,
// quitte l'app, la remplace et la rouvre. Sans signature Apple, macOS redemande ensuite
// l'enregistrement de l'écran et le micro (limite de plateforme, voir install.sh).

import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const REPO = 'gfavier-marie/pastille';

export type Update = { version: string; tag: string };

/** « 0.10.0 » est plus récente que « 0.9.2 ». */
export function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** La dernière Release si elle est plus récente que `current`, sinon null (hors ligne compris). */
export async function checkForUpdate(current: string): Promise<Update | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const tag = ((await res.json()) as { tag_name: string }).tag_name;
    const version = tag.replace(/^v/, '');
    return isNewer(version, current) ? { version, tag } : null;
  } catch {
    return null;
  }
}

/** Lance l'installation, qui survit à la fermeture de l'app ; sa sortie va dans `logFile`. */
export function installUpdate(update: Update, logFile: string) {
  const script = `https://raw.githubusercontent.com/${REPO}/${update.tag}/install.sh`;
  const dmg = `https://github.com/${REPO}/releases/download/${update.tag}/VibeScreener-arm64.dmg`;
  const log = openSync(logFile, 'w');
  spawn('/bin/sh', ['-c', `curl -fsSL "${script}" | PASTILLE_DMG_URL="${dmg}" sh`], {
    detached: true,
    stdio: ['ignore', log, log],
  }).unref();
}
