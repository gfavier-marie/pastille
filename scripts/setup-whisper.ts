// Prépare la transcription locale : modèle Whisper + binaire whisper-server.
// Usage : pnpm setup:whisper
//  - modèle : models/ggml-large-v3-turbo-q5_0.bin (547 Mo, Hugging Face)
//  - macOS  : whisper-server via Homebrew (brew install whisper-cpp)
//  - Windows: binaire officiel whisper.cpp (CPU x64) dans vendor/whisper/

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { downloadFile, findWhisperBin, MODEL_FILE, MODEL_URL } from '../apps/desktop/src/main/whisper.ts';

const repoRoot = join(import.meta.dirname, '..');
const WIN_ZIP_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip';

const download = (url: string, dest: string) =>
  downloadFile(url, dest, (done, total) => {
    process.stdout.write(`\r  ${total ? Math.floor((done / total) * 100) : 0} % (${Math.round(done / 1e6)} Mo)`);
  }).then(() => process.stdout.write('\n'));

/** Cherche un fichier par nom dans une arborescence. */
function findFile(dir: string, name: string): string | undefined {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      const found = findFile(p, name);
      if (found) return found;
    } else if (entry.toLowerCase() === name.toLowerCase()) return p;
  }
  return undefined;
}

// 1. Modèle
const modelPath = join(repoRoot, 'models', MODEL_FILE);
if (existsSync(modelPath)) {
  console.log(`Modèle présent : ${modelPath}`);
} else {
  mkdirSync(join(repoRoot, 'models'), { recursive: true });
  console.log(`Téléchargement du modèle ${MODEL_FILE} (547 Mo) depuis Hugging Face…`);
  await download(MODEL_URL, modelPath);
}

// 2. Binaire whisper-server
const bin = findWhisperBin([join(repoRoot, 'vendor', 'whisper')]);
if (bin) {
  console.log(`whisper-server présent : ${bin}`);
} else if (process.platform === 'win32') {
  const vendor = join(repoRoot, 'vendor', 'whisper');
  const tmp = join(repoRoot, 'vendor', 'whisper-tmp');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  console.log('Téléchargement de whisper.cpp (whisper-bin-x64.zip, 9 Mo)…');
  const zip = join(tmp, 'whisper.zip');
  await download(WIN_ZIP_URL, zip);
  execFileSync('tar', ['-xf', zip, '-C', tmp]); // tar.exe est fourni avec Windows 10 et 11
  const server = findFile(tmp, 'whisper-server.exe');
  if (!server) throw new Error("whisper-server.exe absent de l'archive");
  rmSync(vendor, { recursive: true, force: true });
  renameSync(join(server, '..'), vendor); // le dossier contient aussi les DLL nécessaires
  rmSync(tmp, { recursive: true, force: true });
  console.log(`whisper-server installé : ${join(vendor, 'whisper-server.exe')}`);
} else if (process.platform === 'darwin') {
  console.log('whisper-server introuvable. Installe-le avec : brew install whisper-cpp');
  process.exit(1);
} else {
  console.log('Plateforme non prise en charge en V1 (macOS et Windows uniquement).');
  process.exit(1);
}

console.log('Prêt. Mesure : pnpm bench:dictee');
