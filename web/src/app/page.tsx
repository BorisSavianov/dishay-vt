import type { Metadata } from 'next';
import Link from 'next/link';
import { DayCards } from '@/components/aq/DayCards';
import { ForecastChart } from '@/components/aq/ForecastChart';
import { LevelChip } from '@/components/aq/Level';
import { AppShell } from '@/components/shell/AppShell';
import { Icon } from '@/components/shell/Icon';
import { clockLabel, fmtPm, hourLabel, sofiaDate } from '@/lib/aq/format';
import { levelNow, PROFILES, type Profile } from '@/lib/aq/levels';
import { featuredStation, loadForecast } from '@/lib/aq/load';
import { advice, air, profileName, type AirKey } from '@/lib/aq/strings';
import { langOf, withLang } from '@/lib/page';

export const dynamic = 'force-dynamic';

type Params = Promise<{ lang?: string | string[]; station?: string | string[]; profile?: string | string[] }>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: air(lang, 'web.title'), description: air(lang, 'web.lead') };
}

export default async function AirNow({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const lang = langOf(params);
  const tr = (key: AirKey, vars?: Record<string, string | number>) => air(lang, key, vars);
  const { source, forecast } = await loadForecast();

  const station = forecast.stations.find((s) => s.id === params.station) ?? featuredStation(forecast);
  const profile: Profile = PROFILES.find((p) => p === params.profile) ?? 'asthma';
  const now = new Date();
  const today = sofiaDate(now);
  const tomorrow = sofiaDate(new Date(now.getTime() + 24 * 3600_000));
  const current = levelNow(station, now);
  const hourly = (station.hourly ?? []).filter((h) => new Date(h.t).getTime() >= now.getTime() - 3600_000);
  const days = station.daily.filter((d) => d.date >= today).slice(0, 3);
  const { mae } = forecast.model;
  const modelReady = forecast.model.name !== 'demo' && mae.model > 0;

  // Stations grouped by city, the featured city first, so the picker reads like a list of places.
  const featuredCity = featuredStation(forecast).city;
  const cities = new Map<string, typeof forecast.stations>();
  for (const s of [...forecast.stations].sort((a, b) => a.name.localeCompare(b.name, 'bg'))) {
    cities.set(s.city, [...(cities.get(s.city) ?? []), s]);
  }
  const groups = [...cities.entries()].sort(
    ([a], [b]) => Number(b === featuredCity) - Number(a === featuredCity) || a.localeCompare(b, 'bg'),
  );

  return (
    <AppShell
      lang={lang}
      active="dashboard"
      title={tr('air.title')}
      lead={tr('web.lead')}
      updated={forecast.generated_at}
    >
      {source === 'demo' && (
        <p className="notice" role="status">
          {tr('air.demo')}
        </p>
      )}
      {source === 'bundled' && (
        <p className="notice" role="status">
          {tr('web.bundled')}
        </p>
      )}

      <div className="air-top">
        <section className="card air-now" aria-labelledby="now-title">
          <div className="card-head">
            <div>
              <p className="eyebrow">{station.city}</p>
              <h2 className="card-title" id="now-title">
                {station.name}
              </h2>
            </div>
            <span className="pill">{tr('web.generated', { time: hourLabel(lang, forecast.generated_at) })}</span>
          </div>
          {current ? (
            <>
              <LevelChip big level={current.level} lang={lang} />
              <p className="air-now-pm">
                {tr('web.now.pm', { pm25: fmtPm(lang, current.pm25), pm10: fmtPm(lang, current.pm10) })}
                <span> · {current.measured ? tr('air.now.measured') : tr('air.now.forecast')}</span>
              </p>
              <p className="air-advice">
                <strong>{profileName(lang, profile)}:</strong> {advice(lang, profile, current.level)}
              </p>
            </>
          ) : (
            <p className="air-now-pm">{tr('web.now.none')}</p>
          )}

          <form className="air-picker" method="get" action="/">
            <input type="hidden" name="lang" value={lang} />
            <label className="field">
              <span>{tr('air.station')}</span>
              <select name="station" defaultValue={station.id}>
                {groups.map(([city, list]) => (
                  <optgroup key={city} label={city}>
                    {list.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{tr('web.profile')}</span>
              <select name="profile" defaultValue={profile}>
                {PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {profileName(lang, p)}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary" type="submit">
              {tr('web.station.go')}
            </button>
          </form>
        </section>

        <aside className="card insight air-model" aria-labelledby="model-title">
          <h2 className="card-title" id="model-title">
            <Icon name="sparkle" />
            {tr('web.model.title')}
          </h2>
          <p className="insight-text">
            {modelReady
              ? tr('web.model.body', {
                  model: fmtPm(lang, mae.model),
                  cams: fmtPm(lang, mae.cams),
                  persistence: fmtPm(lang, mae.persistence),
                })
              : tr('web.model.pending')}
          </p>
          <Link className="btn insight-cta" href={withLang('/why', lang)}>
            {tr('web.model.cta')}
            <Icon name="arrow" />
          </Link>
        </aside>
      </div>

      {hourly.length > 1 && (
        <section className="card air-chart">
          <ForecastChart
            hourly={hourly}
            lang={lang}
            labels={{
              title: tr('air.chart.title'),
              subtitle: tr('air.chart.sub'),
              pollutant: tr('web.chart.pm'),
              ours: tr('air.chart.ours'),
              cams: tr('air.chart.cams'),
              band: tr('web.chart.band'),
              alt: tr('web.chart.alt', { pm: '{pm}', name: station.name }),
              table: tr('web.chart.table'),
              hour: tr('web.chart.hour'),
              now: tr('web.chart.now'),
              readout: tr('web.chart.readout', { time: '{time}', value: '{value}' }),
            }}
          />
          <p className="note">
            {tr('air.source')} · {clockLabel(lang, forecast.generated_at)}
          </p>
        </section>
      )}

      {days.length > 0 && <DayCards days={days} lang={lang} today={today} tomorrow={tomorrow} />}
    </AppShell>
  );
}
