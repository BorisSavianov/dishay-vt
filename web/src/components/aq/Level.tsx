import { clampLevel, LEVEL_COLORS, levelTextColor, type Level } from '@/lib/aq/levels';
import { levelName } from '@/lib/aq/strings';
import type { Lang } from '@/lib/types';

// A level in its EAQI colour, with the name in words so colour is never the only signal.
export function LevelChip({ level, lang, big = false }: { level: number; lang: Lang; big?: boolean }) {
  const l: Level = clampLevel(level);
  return (
    <span className={`level-chip${big ? ' is-big' : ''}`} style={{ background: LEVEL_COLORS[l], color: levelTextColor(l) }}>
      <span className="level-num" aria-hidden="true">
        {l}
      </span>
      {levelName(lang, l)}
    </span>
  );
}
