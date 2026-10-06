// Réglages (§4.8), dans settings.json. La clé d'API est chiffrée par le trousseau du système.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import { DEFAULT_INSTRUCTIONS } from './export/build.ts';
import { UI_PROMPT } from './whisper.ts';

export type Settings = {
  shortcut: string; // accélérateur Electron
  commentMode: 'auto' | 'push' | 'keyboard'; // dictée automatique, appuyer pour parler (⌥), clavier seul
  silenceMs: number; // 0 = pas d'arrêt sur silence
  language: string;
  exportDir: string;
  engine: 'local' | 'api';
  apiUrl: string;
  apiModel: string;
  glossary: string; // prompt initial de Whisper
  instructions: string; // texte d'instructions en tête du PDF
  firstRunDone: boolean;
  copyPdf: boolean; // PDF mis dans le presse-papiers après l'export
  openAtLogin: boolean;
  floatingBar: boolean; // barre flottante pendant une session
};

/** Ce que voit la fenêtre de réglages : jamais la clé elle-même. */
export type SettingsView = Settings & { hasApiKey: boolean };

export function createSettings(dataDir: string, documentsDir: string) {
  const path = join(dataDir, 'settings.json');
  const defaults: Settings = {
    shortcut: 'CommandOrControl+Shift+2',
    commentMode: 'auto',
    silenceMs: 3000,
    language: 'fr',
    exportDir: join(documentsDir, 'Pastille'),
    engine: 'local',
    apiUrl: 'https://api.openai.com/v1',
    apiModel: 'whisper-1',
    glossary: UI_PROMPT,
    instructions: DEFAULT_INSTRUCTIONS,
    firstRunDone: false,
    copyPdf: true,
    openAtLogin: false,
    floatingBar: false,
  };
  const stored = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Partial<Settings> & { apiKey?: string }) : {};
  let settings: Settings = { ...defaults, ...stored };
  let apiKey = stored.apiKey ?? '';

  function save() {
    writeFileSync(path, JSON.stringify({ ...settings, apiKey }, null, 2));
  }

  return {
    get: () => settings,
    view: (): SettingsView => ({ ...settings, hasApiKey: !!apiKey }),
    update(patch: Partial<Settings>) {
      settings = { ...settings, ...patch };
      save();
      return settings;
    },
    setApiKey(key: string) {
      apiKey = key && safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key).toString('base64') : '';
      save();
    },
    apiKey: () => (apiKey ? safeStorage.decryptString(Buffer.from(apiKey, 'base64')) : ''),
    defaults,
  };
}
