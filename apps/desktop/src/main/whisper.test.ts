import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioContextFor, downloadFile, looksRepeated } from './whisper.ts';

describe('audioContextFor', () => {
  it('multiples de 256, au moins 768, au plus 1500 (30 s)', () => {
    expect(audioContextFor(5_000)).toBe(768);
    expect(audioContextFor(12_000)).toBe(1024);
    expect(audioContextFor(15_000)).toBe(1280);
    expect(audioContextFor(60_000)).toBe(1500);
  });
});

describe('looksRepeated', () => {
  it('repère un texte trop long pour la durée (Whisper en boucle)', () => {
    const phrase = 'Sur ce bouton, mets un border-radius de 8 px, plus de padding, et un header plus haut. ';
    expect(looksRepeated(phrase.trim(), 5_800)).toBe(false);
    expect(looksRepeated(phrase.repeat(9).trim(), 5_800)).toBe(true);
    expect(looksRepeated('', 500)).toBe(false);
  });
});

describe('downloadFile', () => {
  it('abandonne un téléchargement qui ne reçoit plus rien, sans laisser de fichier', async () => {
    // Le serveur envoie un premier morceau puis plus rien (connexion bloquée).
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-length': '1000' });
      res.write(Buffer.alloc(100));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const dest = join(mkdtempSync(join(tmpdir(), 'pastille-dl-')), 'fichier');
    const seen: number[] = [];
    try {
      await expect(downloadFile(`http://127.0.0.1:${port}/`, dest, (done) => seen.push(done), 200)).rejects.toThrow('60 s');
    } finally {
      server.closeAllConnections();
      server.close();
    }
    expect(seen).toEqual([100]);
    expect(existsSync(dest)).toBe(false);
  });
});
