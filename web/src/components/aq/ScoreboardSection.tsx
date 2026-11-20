import { dayLabel, fmtPm } from '@/lib/aq/format';
import type { ScoreboardView } from '@/lib/aq/scoreboard';
import { air } from '@/lib/aq/strings';
import type { AqMae } from '@/lib/aq/types';
import { maeBars } from '@/lib/aq/why';
import type { Lang } from '@/lib/types';
import { LineChart } from './LineChart';

const KEY_CLASS: Record<keyof AqMae, string> = { model: 'is-model', cams: 'is-cams', persistence: 'is-persistence' };
const KEY_NAME = { model: 'why.f.model', cams: 'why.f.cams', persistence: 'why.f.persistence' } as const;

// „Проверка на живо“: the forecast scored with the real weather forecast this season, and live since today.
export function ScoreboardSection({ view, from, to, lang }: { view: ScoreboardView; from: string; to: string; lang: Lang }) {
  const tr = (key: Parameters<typeof air>[1], vars?: Record<string, string | number>) => air(lang, key, vars);
  const pm = (n: number) => fmtPm(lang, n);
  const short = (d: string) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}`;
  const days = view.days;

  return (
    <section className="card scoreboard" aria-labelledby="sb-title">
      <p className="eyebrow">{tr('sb.title')}</p>
      <h2 className="card-title sb-headline" id="sb-title">
        {view.headline}
      </h2>
      <p className="card-sub">{tr('sb.sub', { from: dayLabel(lang, from), to: dayLabel(lang, to) })}</p>
      {view.live && <p className="sb-live">{view.live}</p>}

      <div className="row-split sb-row">
        <div>
          {view.bars.map((b) => (
            <div key={b.area} className="mae-group">
              <h3 className="mae-group-title">{tr(b.area === 'vt' ? 'why.mae.vt' : 'why.mae.bg')}</h3>
              <ul className="bars mae-bars">
                {maeBars(b).map((bar) => (
                  <li key={bar.key} className={KEY_CLASS[bar.key]}>
                    <span>{tr(KEY_NAME[bar.key])}</span>
                    <span className="bar-track">
                      <span className="bar" style={{ width: `${Math.max(bar.share * 100, 2)}%` }} />
                    </span>
                    <span data-count>{pm(bar.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {days.length > 1 && (
          <div>
            <h3 className="mae-group-title">{tr('sb.days.title')}</h3>
            <LineChart
              xLabels={days.map((d, i) => (i % 3 === 0 || i === days.length - 1 ? short(d.date) : ''))}
              alt={tr('sb.days.title')}
              format={pm}
              lines={[
                { name: tr('sb.observed'), className: 'is-observed', values: days.map((d) => d.observed_pm10) },
                { name: tr('why.f.model'), className: 'is-model', values: days.map((d) => d.model_pm10) },
                { name: tr('why.f.cams'), className: 'is-cams', values: days.map((d) => d.cams_pm10) },
              ]}
            />
          </div>
        )}
      </div>
      <p className="note">{view.note}</p>
    </section>
  );
}
