import { dayLabel, fmtPm } from '@/lib/aq/format';
import { clampLevel, LEVEL_COLORS } from '@/lib/aq/levels';
import { air } from '@/lib/aq/strings';
import type { AqDay } from '@/lib/aq/types';
import type { Lang } from '@/lib/types';
import { LevelChip } from './Level';

// The next three days: level, daily means, the EU-limit flag and the model's top reasons.
export function DayCards({ days, lang, today, tomorrow }: { days: AqDay[]; lang: Lang; today: string; tomorrow: string }) {
  return (
    <section aria-labelledby="days-title">
      <h2 className="section-title" id="days-title">
        {air(lang, 'air.days.title')}
      </h2>
      <div className="day-grid">
        {days.map((d) => {
          const name = d.date === today ? air(lang, 'day.today') : d.date === tomorrow ? air(lang, 'day.tomorrow') : null;
          const reasons = d.reasons.filter((r) => r.impact > 0).slice(0, 3);
          return (
            <article key={d.date} className="card day-card" style={{ borderTopColor: LEVEL_COLORS[clampLevel(d.level)] }}>
              <p className="day-name">
                {name ? <strong>{name}</strong> : null}
                <span>{dayLabel(lang, d.date)}</span>
              </p>
              <LevelChip level={d.level} lang={lang} />
              <p className="day-means">
                {air(lang, 'web.days.means', { pm10: fmtPm(lang, d.pm10_mean), pm25: fmtPm(lang, d.pm25_mean) })}
              </p>
              {d.exceeds_eu_limit && <p className="eu-flag">{air(lang, 'air.eu')}</p>}
              {reasons.length > 0 && (
                <div className="reasons">
                  <p className="reasons-title">{air(lang, 'air.days.why')}</p>
                  <ul>
                    {reasons.map((r) => (
                      <li key={r.feature}>
                        <span>{lang === 'en' && r.label_en ? r.label_en : r.label_bg}</span>
                        <span className="reason-impact">+{fmtPm(lang, r.impact)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
