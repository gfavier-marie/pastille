// Icônes de l'interface : tracés en trait, couleur héritée (currentColor), décoratives (aria-hidden).

import type { CSSProperties, ReactNode } from 'react';

type Props = { size?: number; className?: string; style?: CSSProperties };

function Stroke(props: Props & { children: ReactNode; box?: number; width?: number }) {
  const box = props.box ?? 16;
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox={`0 0 ${box} ${box}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={props.width ?? 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={props.className}
      style={props.style}
    >
      {props.children}
    </svg>
  );
}

/** Logo : pastille pleine, pointe en bas à gauche. */
export const Logo = ({ size = 28, color = 'var(--accent)', hole = '#fff', ...p }: Props & { color?: string; hole?: string }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className={p.className} style={{ flex: 'none', ...p.style }}>
    <path d="M14 2a12 12 0 1 1 0 24H2V14A12 12 0 0 1 14 2z" fill={color} />
    <circle cx="14" cy="14" r="4.2" fill={hole} />
  </svg>
);

export const Capture = (p: Props) => (
  <Stroke {...p} width={1.6}>
    <path d="M2 5V3.5A1.5 1.5 0 0 1 3.5 2H5M11 2h1.5A1.5 1.5 0 0 1 14 3.5V5M14 11v1.5a1.5 1.5 0 0 1-1.5 1.5H11M5 14H3.5A1.5 1.5 0 0 1 2 12.5V11" />
    <circle cx="8" cy="8" r="2" />
  </Stroke>
);
/** Carré : arrêter l'enregistrement. */
export const Stop = (p: Props) => (
  <Stroke {...p}>
    <rect x="4" y="4" width="8" height="8" rx="1.5" />
  </Stroke>
);
/** Caméra : mode vidéo. */
export const Video = (p: Props) => (
  <Stroke {...p}>
    <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
    <path d="M10.5 7l4-2v6l-4-2" />
  </Stroke>
);
export const Window = (p: Props) => (
  <Stroke {...p}>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M2 6h12" />
  </Stroke>
);
export const Export = (p: Props) => (
  <Stroke {...p}>
    <path d="M8 2v8M5 5l3-3 3 3M3 10v2.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V10" />
  </Stroke>
);
export const Download = (p: Props) => (
  <Stroke {...p}>
    <path d="M8 2v8M5 7l3 3 3-3M3 10v2.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V10" />
  </Stroke>
);
export const Plus = (p: Props) => (
  <Stroke {...p}>
    <path d="M8 3v10M3 8h10" />
  </Stroke>
);
export const Qr = (p: Props) => (
  <Stroke {...p}>
    <rect x="2" y="2" width="4.5" height="4.5" rx="0.8" />
    <rect x="9.5" y="2" width="4.5" height="4.5" rx="0.8" />
    <rect x="2" y="9.5" width="4.5" height="4.5" rx="0.8" />
    <path d="M9.5 9.5h2v2M14 9.5h0M9.5 14h2M14 12v2" />
  </Stroke>
);
export const Sliders = (p: Props) => (
  <Stroke {...p}>
    <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" />
    <circle cx="10.5" cy="4.5" r="1.5" />
    <circle cx="5.5" cy="11.5" r="1.5" />
  </Stroke>
);
export const Menu = (p: Props) => (
  <Stroke {...p}>
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
  </Stroke>
);
export const Power = (p: Props) => (
  <Stroke {...p}>
    <path d="M8 2v5" />
    <path d="M4.6 4.3a5 5 0 1 0 6.8 0" />
  </Stroke>
);
export const Mic = (p: Props) => (
  <Stroke {...p}>
    <rect x="6" y="1.5" width="4" height="8" rx="2" />
    <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" />
  </Stroke>
);
export const Tablet = (p: Props) => (
  <Stroke {...p}>
    <rect x="3" y="1.5" width="10" height="13" rx="1.5" />
    <path d="M7 12.3h2" />
  </Stroke>
);
export const Screen = (p: Props) => (
  <Stroke {...p} width={1.3}>
    <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
    <path d="M5.5 14h5M8 11.5V14" />
    <circle cx="8" cy="7" r="1.6" fill="currentColor" stroke="none" />
  </Stroke>
);
export const Waveform = (p: Props) => (
  <Stroke {...p} width={1.3}>
    <path d="M2 8h1M5 5v6M8 3v10M11 6v4M14 8h0" />
  </Stroke>
);
export const Keyboard = (p: Props) => (
  <Stroke {...p} width={1.4}>
    <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
    <path d="M4 7h0M6.5 7h0M9 7h0M11.5 7h0M5 9.5h6" />
  </Stroke>
);
export const Spinner = (p: Props) => (
  <Stroke {...p} box={12} width={1.6} className={`spin ${p.className ?? ''}`}>
    <path d="M6 1.25A4.75 4.75 0 1 1 1.25 6" />
  </Stroke>
);
export const Warning = (p: Props) => (
  <Stroke {...p} box={14}>
    <path d="M7 1.8 12.6 11.6H1.4z" />
    <path d="M7 5.6v2.6M7 10h0" />
  </Stroke>
);
export const Lock = (p: Props) => (
  <Stroke {...p} width={1.4}>
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </Stroke>
);
export const Info = (p: Props) => (
  <Stroke {...p} width={1.4}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 7.2v4M8 4.8h0" />
  </Stroke>
);
export const ChevronLeft = (p: Props) => (
  <Stroke {...p} width={1.7}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </Stroke>
);
export const ChevronRight = (p: Props) => (
  <Stroke {...p} width={1.7}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Stroke>
);
export const ChevronDown = (p: Props) => (
  <Stroke {...p} width={1.8}>
    <path d="M4 6l4 4 4-4" />
  </Stroke>
);
export const Pencil = (p: Props) => (
  <Stroke {...p}>
    <path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z" />
  </Stroke>
);
export const Undo = (p: Props) => (
  <Stroke {...p}>
    <path d="M5.5 4 2.5 7l3 3" />
    <path d="M2.5 7H10a3.5 3.5 0 0 1 0 7H8" />
  </Stroke>
);
export const Close = (p: Props) => (
  <Stroke {...p} width={1.7}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Stroke>
);
export const Folder = (p: Props) => (
  <Stroke {...p} width={1.4}>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6l1.5 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
  </Stroke>
);
export const Terminal = (p: Props) => (
  <Stroke {...p} width={1.4}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
    <path d="M4.5 6l2 2-2 2M8.5 10.5h3" />
  </Stroke>
);
export const Trash = (p: Props) => (
  <Stroke {...p} width={1.4}>
    <path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6M6.8 7v4.5M9.2 7v4.5" />
  </Stroke>
);
export const Picture = (p: Props) => (
  <Stroke {...p} width={1.4}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <circle cx="5.8" cy="6.2" r="1.2" />
    <path d="M2.5 12.5 6.2 8.8l2.4 2.4 1.9-1.9 3 3" />
  </Stroke>
);
export const Doc = (p: Props) => (
  <Stroke {...p} width={1.3}>
    <path d="M4 1.5h5.5L12.5 4.5v10h-8.5z" />
    <path d="M9.5 1.5v3h3M6 8.5h4.5M6 11h4.5" />
  </Stroke>
);

/** Coche dans un disque plein (succès). */
export const CheckCircle = ({ size = 16, color = 'var(--success)', mark = '#fff' }: Props & { color?: string; mark?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flex: 'none' }}>
    <circle cx="8" cy="8" r="7" fill={color} />
    <path d="M4.8 8.2 7 10.4l4.2-4.6" stroke={mark} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
