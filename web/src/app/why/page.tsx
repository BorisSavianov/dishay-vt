import type { Metadata } from 'next';
import { EpisodeChart } from '@/components/aq/EpisodeChart';
import { LevelChip } from '@/components/aq/Level';
import { LineChart } from '@/components/aq/LineChart';
import { ScoreboardSection } from '@/components/aq/ScoreboardSection';
import { dayBefore, readEpisode } from '@/lib/aq/episode';
import { PM25_BANDS } from '@/lib/aq/levels';
import { Kpi } from '@/components/Kpi';
import { AppShell } from '@/components/shell/AppShell';
import deaths from '@/data/pm25_deaths_bg_eu.json';
import { dayLabel, fmtPm } from '@/lib/aq/format';
import { loadForecast } from '@/lib/aq/load';
import { scoreboardView } from '@/lib/aq/scoreboard';
import { air, type AirKey } from '@/lib/aq/strings';
import type { AqMae } from '@/lib/aq/types';
import { coveragePct, maeBars, pctBetter } from '@/lib/aq/why';
import { fmtInt, fmtNum } from '@/lib/format';
import { langOf, type SearchParams } from '@/lib/page';
import { sourceLine } from '@/lib/sources';
import type { Meta } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Deaths = { meta: Meta; bg: { year: number; value: number }[]; eu: { year: number; value: number }[] };
const eurostat = deaths as Deaths;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: `${air(lang, 'why.title')} · ${air(lang, 'web.title')}`, description: air(lang, 'why.lead') };
}

const KEY_CLASS: Record<keyof AqMae, string> = { model: 'is-model', cams: 'is-cams', persistence: 'is-persistence' };
const KEY_NAME: Record<keyof AqMae, AirKey> = { model: 'why.f.model', cams: 'why.f.cams', persistence: 'why.f.persistence' };

export default async function Why({ searchParams }: { searchParams: SearchParams }) {
  const lang = langOf(await searchParams);
  const tr = (key: AirKey, vars?: Record<string, string | number>) => air(lang, key, vars);
  const { source, forecast } = await loadForecast();
  const m = forecast.model;
  const real = source !== 'demo' && m.mae.model > 0;
  const pm = (n: number) => fmtPm(lang, n);
  const holdout = m.holdout.replace(/^winter\s*/i, '');

  const groups: { title: AirKey; mae: AqMae }[] = [
    { title: 'why.mae.bg', mae: m.mae },
    ...(m.mae_vt ? [{ title: 'why.mae.vt' as AirKey, mae: m.mae_vt }] : []),
  ];
  const better = pctBetter(m.mae.model, m.mae.cams);
  const betterVt = m.mae_vt ? pctBetter(m.mae_vt.model, m.mae_vt.cams) : null;
  const horizons = m.mae_by_horizon ?? [];
  const f1 = m.exceedance_f1;
  const bgLast = eurostat.bg[eurostat.bg.length - 1];
  const euSame = bgLast ? eurostat.eu.find((p) => p.year === bgLast.year) : undefined;
  const years = eurostat.bg.map((p) => p.year).filter((y) => eurostat.eu.some((p) => p.year === y));
  const episode = readEpisode();
  const sbView = scoreboardView(m.scoreboard, lang);
  const ep1 = episode ? dayBefore(episode) : null;
  const score = episode?.score;

  return (
    <AppShell lang={lang} active="why" title={tr('why.title')} lead={tr('why.lead')} updated={forecast.generated_at}>
      {!real && (
        <p className="notice" role="status">
          {tr('why.pending')}
        </p>
      )}

      {real && (
        <>
          <section className="kpis" aria-label={tr('why.title')}>
            {better !== null && (
              <Kpi primary icon="trendDown" label={tr('why.kpi.bg')} value={`${better}%`}>
                {tr('why.kpi.sub', { holdout })}
              </Kpi>
            )}
            {betterVt !== null && (
              <Kpi icon="pin" label={tr('why.kpi.vt')} value={`${betterVt}%`}>
                {tr('why.kpi.sub', { holdout })}
              </Kpi>
            )}
            {f1 && (
              <Kpi icon="activity" label={tr('why.f1.title')} value={`${fmtNum(lang, f1.model, 2)} / ${fmtNum(lang, f1.cams, 2)}`}>
                {tr('why.f.model')} / CAMS, F1
              </Kpi>
            )}
            <Kpi icon="database" label={tr('why.kpi.rows')} value={fmtInt(lang, m.trained_rows)}>
              {tr('why.kpi.rows.sub', { sensors: fmtInt(lang, m.sensors) })}
            </Kpi>
          </section>

          {sbView && m.scoreboard?.replay && (
            <ScoreboardSection view={sbView} from={m.scoreboard.replay.from} to={m.scoreboard.replay.to} lang={lang} />
          )}

          <div className="row-split">
            <section className="card" aria-labelledby="mae-title">
              <h2 className="card-title" id="mae-title">
                {tr('why.mae.title')}
              </h2>
              <p className="card-sub">{tr('why.mae.sub')}</p>
              {groups.map((g) => (
                <div key={g.title} className="mae-group">
                  <h3 className="mae-group-title">{tr(g.title)}</h3>
                  <ul className="bars mae-bars">
                    {maeBars(g.mae).map((b) => (
                      <li key={b.key} className={KEY_CLASS[b.key]}>
                        <span>{tr(KEY_NAME[b.key])}</span>
                        <span className="bar-track">
                          <span className="bar" style={{ width: `${Math.max(b.share * 100, 2)}%` }} />
                        </span>
                        <span>{pm(b.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            {horizons.length > 1 && (
              <section className="card" aria-labelledby="h-title">
                <h2 className="card-title" id="h-title">
                  {tr('why.h.title')}
                </h2>
                <p className="card-sub">{tr('why.h.sub')}</p>
                <LineChart
                  xLabels={horizons.map((h) => String(h.h))}
                  axis={tr('why.h.axis')}
                  alt={tr('why.h.title')}
                  format={pm}
                  lines={(['model', 'persistence', 'cams'] as const).map((k) => ({
                    name: tr(KEY_NAME[k]),
                    className: KEY_CLASS[k],
                    values: horizons.map((h) => h[k]),
                  }))}
                />
                <details className="data-table">
                  <summary>{tr('why.h.table')}</summary>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col">{tr('why.h.axis')}</th>
                          <th scope="col">{tr('why.f.model')}</th>
                          <th scope="col">{tr('why.f.persistence')}</th>
                          <th scope="col">CAMS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {horizons.map((h) => (
                          <tr key={h.h}>
                            <th scope="row">{h.h}</th>
                            <td>{pm(h.model)}</td>
                            <td>{pm(h.persistence)}</td>
                            <td>{pm(h.cams)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>
            )}
          </div>

          <div className="row-split">
            {m.importance && m.importance.length > 0 && (
              <section className="card" aria-labelledby="imp-title">
                <h2 className="card-title" id="imp-title">
                  {tr('why.imp.title')}
                </h2>
                <p className="card-sub">{tr('why.imp.sub')}</p>
                <ul className="bars imp-bars">
                  {m.importance.map((g) => (
                    <li key={g.group}>
                      <span>{lang === 'en' && g.label_en ? g.label_en : g.label_bg}</span>
                      <span className="bar-track">
                        <span className="bar" style={{ width: `${(g.share / m.importance![0]!.share) * 100}%` }} />
                      </span>
                      <span>{Math.round(g.share * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {f1 && (
              <section className="card insight" aria-labelledby="f1-title">
                <h2 className="card-title" id="f1-title">
                  {tr('why.f1.title')}
                </h2>
                <p className="card-sub">{tr('why.f1.sub')}</p>
                <div className="f1-pair">
                  <p>
                    <strong>{fmtNum(lang, f1.model, 2)}</strong>
                    <span>{tr('why.f.model')}</span>
                  </p>
                  <p>
                    <strong>{fmtNum(lang, f1.cams, 2)}</strong>
                    <span>{tr('why.f.cams')}</span>
                  </p>
                </div>
                {f1.cams > 0 && (
                  <p className="insight-text">{tr('why.f1.body', { times: fmtNum(lang, f1.model / f1.cams, 1) })}</p>
                )}
              </section>
            )}
          </div>
        </>
      )}

      {episode && ep1 && (
        <div className="row-trend">
          <section className="card" aria-labelledby="ep-title">
            <h2 className="card-title" id="ep-title">
              {tr('ep.title', { date: dayLabel(lang, episode.date, true) })}
            </h2>
            <p className="card-sub">
              {tr('ep.sub', {
                place: lang === 'en' && episode.place_en ? episode.place_en : episode.place,
                sensors: episode.sensors,
              })}
            </p>
            <EpisodeChart
              observed={episode.observed}
              forecast={ep1.hourly}
              cams={episode.cams}
              threshold={PM25_BANDS[1]}
              alt={tr('ep.alt', { date: dayLabel(lang, episode.date, true) })}
              format={pm}
              labels={{
                observed: tr('ep.observed'),
                forecast: tr('ep.forecast'),
                band: tr('ep.band'),
                cams: tr('ep.cams'),
                threshold: tr('ep.threshold'),
              }}
            />
            <ul className="ep-days">
              <li>
                <LevelChip level={episode.observed_daily.level} lang={lang} />
                {tr('ep.measured', {
                  level: episode.observed_daily.level,
                  pm10: pm(episode.observed_daily.pm10_mean),
                  eu: episode.observed_daily.exceeds_eu_limit ? tr('ep.eu') : '',
                })}
              </li>
              {[...episode.forecasts]
                .sort((a, b) => b.days_before - a.days_before)
                .map((f) => (
                  <li key={f.issued}>
                    <LevelChip level={f.daily.alert_level ?? f.daily.level} lang={lang} />
                    {tr(f.days_before === 1 ? 'ep.ours1' : 'ep.ours', {
                      days: f.days_before,
                      level: f.daily.alert_level ?? f.daily.level,
                      pm10: pm(f.daily.pm10_mean),
                    })}
                  </li>
                ))}
              <li>
                <LevelChip level={episode.cams_daily.level} lang={lang} />
                {tr('ep.camsday', { level: episode.cams_daily.level, pm10: pm(episode.cams_daily.pm10_mean) })}
              </li>
            </ul>
            {episode.observed_daily.exceeds_eu_limit && !ep1.daily.exceeds_eu_limit && (
              <p className="note ep-honest">
                {tr('ep.honest', { ours: pm(ep1.daily.pm10_mean), real: pm(episode.observed_daily.pm10_mean) })}
              </p>
            )}
          </section>

          {score && (
            <aside className="card insight" aria-labelledby="score-title">
              <h2 className="card-title" id="score-title">
                {tr('ep.score.title')}
              </h2>
              <p className="card-sub">{tr('ep.score.sub', { days: score.days, bad: score.bad_days })}</p>
              <dl className="ep-score">
                <div>
                  <dt>{tr('why.f.model')}</dt>
                  <dd>
                    <strong>
                      {score.model_alert.hits}/{score.bad_days}
                    </strong>{' '}
                    {tr('ep.score.hits')}
                  </dd>
                  <dd>
                    <strong>{score.model_alert.false_alarms}</strong> {tr('ep.score.false')}
                  </dd>
                </div>
                <div>
                  <dt>{tr('why.f.cams')}</dt>
                  <dd>
                    <strong>
                      {score.cams.hits}/{score.bad_days}
                    </strong>{' '}
                    {tr('ep.score.hits')}
                  </dd>
                  <dd>
                    <strong>{score.cams.false_alarms}</strong> {tr('ep.score.false')}
                  </dd>
                </div>
              </dl>
              <p className="insight-text">
                {tr('ep.score.body', {
                  ours: score.model_alert.hits,
                  cams: score.cams.hits,
                  bad: score.bad_days,
                  oursFalse: score.model_alert.false_alarms,
                  camsFalse: score.cams.false_alarms,
                })}
              </p>
              {score.worst10 && (
                <p className="note">
                  {tr('ep.score.worst', { ours: score.worst10.model_warned, cams: score.worst10.cams_warned })}
                </p>
              )}
            </aside>
          )}
        </div>
      )}

      <div className="row-split">
        {years.length > 1 && bgLast && euSame && (
          <section className="card" aria-labelledby="eu-title">
            <h2 className="card-title" id="eu-title">
              {tr('why.eu.title')}
            </h2>
            <p className="card-sub">{tr('why.eu.sub')}</p>
            <p className="insight-text eu-stat">
              {tr('why.eu.body', {
                year: bgLast.year,
                bg: fmtInt(lang, bgLast.value),
                eu: fmtInt(lang, euSame.value),
                times: fmtNum(lang, bgLast.value / euSame.value, 1),
              })}
            </p>
            <LineChart
              xLabels={years.map((y, i) => (i % 3 === 0 || i === years.length - 1 ? String(y) : ''))}
              alt={tr('why.eu.sub')}
              format={(n) => fmtInt(lang, n)}
              lines={[
                { name: tr('why.eu.bg'), className: 'is-model', values: years.map((y) => eurostat.bg.find((p) => p.year === y)!.value) },
                { name: tr('why.eu.eu'), className: 'is-persistence', values: years.map((y) => eurostat.eu.find((p) => p.year === y)!.value) },
              ]}
            />
            <p className="note">{sourceLine(lang, eurostat.meta)}</p>
          </section>
        )}

        <section className="card prose" aria-labelledby="method-title">
          <h2 className="card-title" id="method-title">
            {tr('why.method.title')}
          </h2>
          <ul>
            <li>{tr('why.method.1', { holdout })}</li>
            <li>{tr('why.method.2')}</li>
            <li>{tr('why.method.3')}</li>
            <li>{tr('why.method.4')}</li>
            {m.algorithm && <li>{tr('why.method.algo', { algorithm: m.algorithm })}</li>}
            {coveragePct(m.band_coverage) !== null && (
              <li>{tr('why.method.band', { pct: coveragePct(m.band_coverage)! })}</li>
            )}
          </ul>
          <p className="note">{tr('air.source')}</p>
        </section>
      </div>
    </AppShell>
  );
}
