// Mises à jour (Mac, app installée) : la dernière version publiée (latest.json, écrit par la CI
// au tag, sur le bucket R2 des téléchargements) est comparée à celle de l'app. « Mettre à jour »
// lance install.sh, détaché : il télécharge le .dmg de cette version, quitte l'app, la remplace
// et la rouvre. Sans signature Apple, macOS redemande ensuite l'enregistrement de l'écran et le
// micro (limite de plateforme, voir install.sh). PASTILLE_DOWNLOADS vise un autre bucket (essais).

import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const DOWNLOADS = process.env.PASTILLE_DOWNLOADS ?? 'https://dl.vibescreener.dev'; // domaine provisoire (M0)

export type Update = { version: string };

/** « 0.10.0 » est plus récente que « 0.9.2 ». */
export function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** La dernière version si elle est plus récente que `current`, sinon null (hors ligne compris). */
export async function checkForUpdate(current: string): Promise<Update | null> {
  try {
    const res = await fetch(`${DOWNLOADS}/latest.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    const { version } = (await res.json()) as { version: string };
    return isNewer(version, current) ? { version } : null;
  } catch {
    return null;
  }
}

/** Lance l'installation, qui survit à la fermeture de l'app ; sa sortie va dans `logFile`. */
export function installUpdate(update: Update, logFile: string) {
  const dmg = `${DOWNLOADS}/v${update.version}/VibeScreener-arm64.dmg`;
  const log = openSync(logFile, 'w');
  spawn('/bin/sh', ['-c', `curl -fsSL "${DOWNLOADS}/install.sh" | PASTILLE_DMG_URL="${dmg}" sh`], {
    detached: true,
    stdio: ['ignore', log, log],
  }).unref();
}
