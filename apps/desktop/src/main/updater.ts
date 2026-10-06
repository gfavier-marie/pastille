// Mises à jour (app installée) : la dernière Release GitHub est comparée à la version de l'app.
// « Mettre à jour » lance le script d'installation de cette Release, détaché (install.sh sur Mac,
// install.ps1 sur Windows) : il télécharge l'installeur, quitte l'app, la remplace et la rouvre.
// Sans signature Apple, macOS redemande ensuite l'enregistrement de l'écran et le micro
// (limite de plateforme, voir install.sh).

import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const REPO = 'gfavier-marie/vibescreener';

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
  const scripts = `https://raw.githubusercontent.com/${REPO}/${update.tag}`;
  const assets = `https://github.com/${REPO}/releases/download/${update.tag}`;
  const log = openSync(logFile, 'w');
  const [cmd, args]: [string, string[]] =
    process.platform === 'win32'
      ? ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `$env:PASTILLE_EXE_URL='${assets}/VibeScreener-Setup.exe'; irm ${scripts}/install.ps1 | iex`]]
      : ['/bin/sh', ['-c', `curl -fsSL "${scripts}/install.sh" | PASTILLE_DMG_URL="${assets}/VibeScreener-arm64.dmg" sh`]];
  spawn(cmd, args, { detached: true, stdio: ['ignore', log, log], windowsHide: true }).unref();
}
