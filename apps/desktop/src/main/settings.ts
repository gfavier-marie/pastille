// Réglages (§4.8), dans settings.json. La clé d'API est chiffrée par le trousseau du système.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import { isLang, type Lang } from '@pastille/shared';
import { DICTS } from '../texts/index.ts';

export type Settings = {
  uiLanguage: 'auto' | Lang; // langue de l'interface, des exports et du MCP ; auto = celle du système
  shortcut: string; // accélérateur Electron
  commentMode: 'auto' | 'push' | 'keyboard'; // dictée automatique, appuyer pour parler (⌥), clavier seul
  silenceMs: number; // 0 = pas d'arrêt sur silence
  language: string; // langue de dictée (code Whisper ou « auto »)
  exportDir: string;
  engine: 'local' | 'api';
  apiUrl: string;
  apiModel: string;
  glossary: string; // prompt initial de Whisper
  instructions: string; // texte d'instructions en tête du PDF
  context: string; // contexte du projet (projet, stack, page testée), repris par la session ouverte et les suivantes
  firstRunDone: boolean;
  copyPdf: boolean; // PDF mis dans le presse-papiers après l'export
  openAtLogin: boolean;
  floatingBar: boolean; // barre flottante pendant une session
  mcpSeenAt: string; // dernière connexion de Claude Code au serveur MCP (ISO), vide si jamais
};

/** Ce que voit la fenêtre de réglages : jamais la clé elle-même. */
export type SettingsView = Settings & { hasApiKey: boolean };

/** `system` : langue du système ; `forced` (PASTILLE_LANG) passe avant le réglage. */
export function createSettings(dataDir: string, documentsDir: string, lang: { system: Lang; forced?: Lang } = { system: 'fr' }) {
  const path = join(dataDir, 'settings.json');
  const uiLangOf = (s: Pick<Settings, 'uiLanguage'>): Lang => lang.forced ?? (isLang(s.uiLanguage) ? s.uiLanguage : lang.system);
  // Glossaire de la langue de dictée (celui de l'interface en détection automatique), instructions de la langue de l'interface.
  const glossaryOf = (s: Settings) => DICTS[isLang(s.language) ? s.language : uiLangOf(s)].glossary;
  const instructionsOf = (s: Settings) => DICTS[uiLangOf(s)].instructions;
  const defaults: Settings = {
    uiLanguage: 'auto',
    // ⇧⌘2, l'ancien défaut, est intercepté par d'autres apps sur certains Mac sans que l'enregistrement échoue.
    shortcut: process.platform === 'darwin' ? 'Command+Control+Alt+P' : 'Control+Alt+P',
    commentMode: 'auto',
    silenceMs: 3000,
    language: lang.forced ?? lang.system, // dictée dans la langue de l'interface au premier lancement
    exportDir: join(documentsDir, 'VibeScreener'),
    engine: 'local',
    apiUrl: 'https://api.openai.com/v1',
    apiModel: 'whisper-1',
    glossary: '', // défauts de la langue, posés plus bas
    instructions: '',
    context: '',
    firstRunDone: false,
    copyPdf: true,
    openAtLogin: false,
    floatingBar: false,
    mcpSeenAt: '',
  };
  const existed = existsSync(path);
  const stored = existed ? (JSON.parse(readFileSync(path, 'utf8')) as Partial<Settings> & { apiKey?: string }) : {};
  if (existed && stored.uiLanguage === undefined) stored.uiLanguage = 'fr'; // installée avant le multilingue : reste en français
  // Glossaire et instructions laissés au défaut d'une langue (save() écrit tout) : ils suivent la langue choisie.
  const dicts = Object.values(DICTS);
  if (dicts.some((d) => d.glossary === stored.glossary)) delete stored.glossary;
  if (dicts.some((d) => d.instructions === stored.instructions)) delete stored.instructions;
  if (stored.exportDir === join(documentsDir, 'Pastille')) delete stored.exportDir; // ancien nom de l'app
  if (stored.shortcut === 'CommandOrControl+Shift+2') delete stored.shortcut; // ancien défaut, écrit par save() : prend le nouveau
  // Le contexte passait autrefois d'une session à la suivante (state.json) : il devient la valeur de départ du réglage.
  const statePath = join(dataDir, 'state.json');
  if (stored.context === undefined && existsSync(statePath)) {
    try {
      stored.context = (JSON.parse(readFileSync(statePath, 'utf8')) as { lastContext?: string }).lastContext ?? '';
    } catch {} // state.json illisible : pas de contexte de départ
  }
  let settings: Settings = { ...defaults, ...stored };
  settings.glossary = stored.glossary ?? glossaryOf(settings);
  settings.instructions = stored.instructions ?? instructionsOf(settings);
  let apiKey = stored.apiKey ?? '';

  function save() {
    writeFileSync(path, JSON.stringify({ ...settings, apiKey }, null, 2));
  }

  return {
    get: () => settings,
    view: (): SettingsView => ({ ...settings, hasApiKey: !!apiKey }),
    update(patch: Partial<Settings>) {
      const before = settings;
      settings = { ...settings, ...patch };
      // Restés au défaut, glossaire et instructions suivent un changement de langue.
      if (patch.glossary === undefined && before.glossary === glossaryOf(before)) settings.glossary = glossaryOf(settings);
      if (patch.instructions === undefined && before.instructions === instructionsOf(before)) settings.instructions = instructionsOf(settings);
      save();
      return settings;
    },
    /** Langue de l'interface, des exports et du MCP. */
    uiLang: () => uiLangOf(settings),
    setApiKey(key: string) {
      apiKey = key && safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key).toString('base64') : '';
      save();
    },
    apiKey: () => {
      try {
        return apiKey ? safeStorage.decryptString(Buffer.from(apiKey, 'base64')) : '';
      } catch {
        return ''; // chiffrée sous l'ancien nom de l'app : à saisir de nouveau
      }
    },
  };
}
