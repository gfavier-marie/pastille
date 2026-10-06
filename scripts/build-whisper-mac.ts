// Compile un whisper-server autonome pour l'app macOS (statique, Metal embarqué),
// sans dépendre des bibliothèques Homebrew. Résultat : vendor/whisper/whisper-server.
// Usage : pnpm build:whisper-mac   (nécessite git, cmake et les outils Xcode en ligne de commande)

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = 'v1.9.4';
const root = join(import.meta.dirname, '..');
const src = join(root, 'vendor', `whisper.cpp-${VERSION}`);
const build = join(src, 'build');
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: 'inherit' });

if (process.platform !== 'darwin') throw new Error('Script réservé à macOS (Windows : pnpm setup:whisper).');
if (!existsSync(src)) run('git', ['clone', '--depth', '1', '--branch', VERSION, 'https://github.com/ggml-org/whisper.cpp', src]);

run('cmake', [
  '-S', src, '-B', build,
  '-DCMAKE_BUILD_TYPE=Release',
  '-DBUILD_SHARED_LIBS=OFF',
  '-DGGML_METAL=ON',
  '-DGGML_METAL_EMBED_LIBRARY=ON', // shaders Metal dans le binaire
  '-DGGML_NATIVE=OFF', // pas d'optimisation propre à cette machine
  `-DCMAKE_OSX_ARCHITECTURES=${process.env.WHISPER_ARCHS ?? 'arm64'}`,
  '-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0',
  '-DWHISPER_BUILD_TESTS=OFF',
]);
run('cmake', ['--build', build, '--config', 'Release', '-j', '--target', 'whisper-server']);

mkdirSync(join(root, 'vendor', 'whisper'), { recursive: true });
copyFileSync(join(build, 'bin', 'whisper-server'), join(root, 'vendor', 'whisper', 'whisper-server'));
run('otool', ['-L', join(root, 'vendor', 'whisper', 'whisper-server')]);
console.log('whisper-server autonome : vendor/whisper/whisper-server');
