export const WAVE_BARS = 18;

/** Durée d'enregistrement « m:ss ». */
export const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

/** Onde de la dictée : les derniers niveaux du micro, du plus ancien au plus récent. */
export function Wave(props: { levels: number[]; small?: boolean }) {
  const max = props.small ? 18 : 22;
  const levels = [...Array(Math.max(0, WAVE_BARS - props.levels.length)).fill(0), ...props.levels.slice(-WAVE_BARS)];
  return (
    <div className={`wave ${props.small ? 'small' : ''}`} aria-hidden="true">
      {levels.map((l, i) => (
        <span key={i} style={{ height: 3 + Math.min(1, l * 14) * (max - 3) }} />
      ))}
    </div>
  );
}

