import { clockLabel } from '@/lib/aq/format';
import { LEVEL_COLORS, levelTextColor } from '@/lib/aq/levels';
import { levelName } from '@/lib/aq/strings';
import type { StoryToday } from '@/lib/story/facts';
import { fmtNum, story } from '@/lib/story/strings';
import type { Lang } from '@/lib/types';
import css from './story.module.css';

// Chapter 7: the air in Veliko Tarnovo now, from the same forecast the dashboard uses.
export function TodayCard({ lang, today }: { lang: Lang; today: StoryToday }) {
  const fallback = today.source !== 'database' || today.stale;
  return (
    <div className={css.today}>
      {today.level === null || today.pm25 === null || today.pm10 === null ? (
        <p className={css.big}>{story(lang, 'ch7.none')}</p>
      ) : (
        <>
          <p
            className={css.levelChip}
            style={{ background: LEVEL_COLORS[today.level], color: levelTextColor(today.level) }}
          >
            {story(lang, 'ch7.level', { level: levelName(lang, today.level) })}
          </p>
          <p className={css.big}>
            {story(lang, 'ch7.pm', { pm25: fmtNum(lang, today.pm25, 1), pm10: fmtNum(lang, today.pm10, 1) })}
          </p>
        </>
      )}
      <p className={css.note}>
        {fallback ? story(lang, 'ch7.bundled') : story(lang, 'ch7.updated', { time: clockLabel(lang, today.updatedIso) })}
      </p>
    </div>
  );
}
