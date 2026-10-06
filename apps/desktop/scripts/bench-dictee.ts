// Mesure du POC dictée : 5 s de français transcrites par whisper-server.
// Usage : pnpm bench:dictee [fichier.wav]

import { readFileSync } from 'node:fs';
import { cpus, platform, arch, totalmem } from 'node:os';
import { join } from 'node:path';
import { findModel, findWhisperBin, startWhisperServer, UI_PROMPT } from '../src/main/whisper.ts';
import { wavDurationMs } from '../src/main/wav.ts';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const wavPath = process.argv[2] ?? join(import.meta.dirname, '..', 'fixtures', 'dictee-fr.wav');
const RUNS = 4;

const bin = findWhisperBin([join(repoRoot, 'vendor', 'whisper')]);
const model = findModel([join(repoRoot, 'models')]);
if (!bin || !model) {
  console.error(`whisper-server ${bin ? 'trouvé' : 'introuvable'}, modèle ${model ? 'trouvé' : 'introuvable'}.`);
  console.error('Lance « pnpm setup:whisper » puis réessaie.');
  process.exit(1);
}

const wav = new Uint8Array(readFileSync(wavPath));
const audioMs = wavDurationMs(wav);
console.log(`Démarrage de whisper-server (${bin})…`);
const server = await startWhisperServer({ bin, model, prompt: UI_PROMPT });

const runs: { text: string; ms: number }[] = [];
for (let i = 0; i < RUNS; i++) runs.push(await server.transcribe(wav));
server.stop();

const warm = runs.slice(1).map((r) => r.ms).sort((a, b) => a - b);
const median = warm[Math.floor(warm.length / 2)] ?? runs[0]!.ms;
const text = runs.at(-1)!.text;
const isAppleSilicon = platform() === 'darwin' && arch() === 'arm64';
const target = isAppleSilicon ? 2000 : 5000;
const words = ['border-radius', 'padding', 'header'];
const found = words.filter((w) => text.toLowerCase().replace(/border radius/g, 'border-radius').includes(w));

const ms = (n: number) => `${Math.round(n)} ms`;
console.log(`
| Mesure | Valeur |
| --- | --- |
| Machine | ${platform()} ${arch()}, ${cpus()[0]?.model.trim()}, ${Math.round(totalmem() / 2 ** 30)} Go |
| Chargement du modèle (une fois) | ${ms(server.loadMs)} |
| Durée de l'audio | ${(audioMs / 1000).toFixed(1)} s |
| 1re transcription | ${ms(runs[0]!.ms)} |
| Transcription (médiane suivantes) | ${ms(median)} — cible < ${ms(target)} ${median < target ? 'OK' : 'KO'} |
| Vocabulaire UI | ${found.length}/${words.length} (${words.map((w) => (found.includes(w) ? w : `~~${w}~~`)).join(', ')}) |

Texte : « ${text} »`);
