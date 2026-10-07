// Mises à jour (app installée) : la dernière version publiée (latest.json, écrit par la CI au tag,
// sur le bucket R2 des téléchargements) est comparée à celle de l'app. « Mettre à jour » télécharge,
// app ouverte et progression affichée, l'installeur de cette version et le script d'installation
// (install.sh sur Mac, install.ps1 sur Windows), puis lance le script, détaché, et ferme l'app :
// il remplace l'app et la rouvre. Sans signature Apple, macOS redemande ensuite l'enregistrement
// de l'écran, le micro et l'Accessibilité (limite de plateforme, voir install.sh).
// PASTILLE_DOWNLOADS vise un autre bucket (essais).

import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { join } from 'node:path';

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

type Download = { url: string; path: string };

/** Ce que la mise à jour télécharge dans `dir` avant de fermer l'app : ensuite, plus besoin du réseau. */
export function updateFiles(platform: NodeJS.Platform, version: string, dir: string): { installer: Download; script: Download } {
  const [installer, script] = platform === 'win32' ? ['VibeScreener-Setup.exe', 'install.ps1'] : ['VibeScreener-arm64.dmg', 'install.sh'];
  return {
    installer: { url: `${DOWNLOADS}/v${version}/${installer}`, path: join(dir, installer) },
    script: { url: `${DOWNLOADS}/${script}`, path: join(dir, script) },
  };
}

/** Commande du script d'installation. Les chemins passent par l'environnement, jamais dans la
 *  commande : un dossier au nom accentué ou avec une apostrophe ne la casse pas. */
export function installerCommand(platform: NodeJS.Platform, files: { installer: string; script: string }) {
  return platform === 'win32'
    ? {
        cmd: 'powershell.exe',
        // Lu en UTF-8 comme par la CI : PowerShell 5.1 lirait un .ps1 sans BOM dans la page de code locale.
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Get-Content -LiteralPath $env:PASTILLE_SCRIPT -Raw -Encoding UTF8 | Invoke-Expression'],
        env: { PASTILLE_SCRIPT: files.script, PASTILLE_EXE_FILE: files.installer },
      }
    : { cmd: '/bin/sh', args: [files.script], env: { PASTILLE_DMG_FILE: files.installer } };
}

/** Lance le script d'installation, qui survit à la fermeture de l'app ; sa sortie va dans `logFile`.
 *  Résolu une fois le script démarré : l'app ne se ferme pas pour rien. */
export function runInstaller(files: { installer: string; script: string }, logFile: string): Promise<void> {
  const { cmd, args, env } = installerCommand(process.platform, files);
  const log = openSync(logFile, 'w');
  const child = spawn(cmd, args, { detached: true, stdio: ['ignore', log, log], windowsHide: true, env: { ...process.env, ...env } });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/** Au lancement qui suit une mise à jour vers `updatingTo` : réussie si l'app est au moins à cette version. */
export function updateOutcome(updatingTo: string, version: string): 'done' | 'failed' | null {
  if (!updatingTo) return null;
  return isNewer(updatingTo, version) ? 'failed' : 'done';
}
