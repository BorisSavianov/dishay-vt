import type { Lang } from '../types';
import { clockLabel, fmtPm } from './format';
import { air } from './strings';
import type { AqMae, AqScoreboard } from './types';

export type ScoreboardView = {
  headline: string;
  bars: ({ area: 'vt' | 'bg' } & AqMae)[];
  days: NonNullable<AqScoreboard['replay']>['vt_days'];
  note: string;
  live: string | null;
};

// What the „Проверка на живо“ section shows. Null when there is no replay, so the section is hidden.
export function scoreboardView(sb: AqScoreboard | undefined, lang: Lang): ScoreboardView | null {
  const replay = sb?.replay;
  if (!sb || !replay) return null;
  const { vt, bg } = replay.mae_pm25_next_day;
  const pct = vt.cams > 0 ? Math.round(((vt.cams - vt.model) / vt.cams) * 100) : 0;
  const live = sb.live
    ? air(lang, 'sb.live', {
        time: clockLabel(lang, sb.live.since),
        hours: sb.live.checked_hours,
        horizons: sb.live.horizons,
        model: fmtPm(lang, sb.live.mae_pm25.model),
        cams: fmtPm(lang, sb.live.mae_pm25.cams),
      })
    : null;
  return {
    headline: air(lang, 'sb.headline', { pct }),
    bars: [
      { area: 'vt', ...vt },
      { area: 'bg', ...bg },
    ],
    days: replay.vt_days,
    note: air(lang, replay.blh === 'era5' ? 'sb.note.era5' : 'sb.note.none'),
    live,
  };
}
