// Autorisations du système, montrées par l'assistant (étape 1) et par l'onglet Autorisations des réglages :
// mêmes lignes, même demande (askPermission). L'Accessibilité (macOS) ne sert qu'au mode vidéo : facultative.

import type { ReactNode } from 'react';
import type { SettingsState } from '../ipc.ts';
import * as I from './icons.tsx';
import { T } from './texts.ts';

export type PermissionRow = {
  kind: 'screen' | 'microphone' | 'accessibility';
  icon: ReactNode;
  title: string;
  why: string;
  ok: boolean;
  optional?: boolean;
};

export function permissionRows(s: SettingsState): PermissionRow[] {
  const P = T.welcome.permissions;
  const mac = s.platform === 'mac';
  const rows: PermissionRow[] = [
    { kind: 'screen', icon: <I.Screen size={20} />, title: P.screen, why: P.screenWhy, ok: s.permissions.screen === 'granted' },
    {
      kind: 'microphone',
      icon: <I.Mic size={20} />,
      title: P.mic,
      why: s.commentMode === 'keyboard' ? P.keyboardChosen : P.micWhy,
      ok: s.permissions.microphone === 'granted',
    },
    {
      kind: 'accessibility',
      icon: <I.Video size={20} />,
      title: P.accessibility,
      why: P.accessibilityWhy,
      ok: s.permissions.accessibility === 'granted',
      optional: true,
    },
  ];
  return mac ? rows : rows.filter((r) => r.kind === 'microphone');
}
