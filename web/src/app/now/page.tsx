import type { Metadata } from 'next';
import Link from 'next/link';
import { DayCards } from '@/components/aq/DayCards';
import { ExplainCard } from '@/components/aq/ExplainCard';
import { ForecastChart } from '@/components/aq/ForecastChart';
import { LevelChip } from '@/components/aq/Level';
import { StationPicker } from '@/components/aq/StationPicker';
import { AppShell } from '@/components/shell/AppShell';
import { Icon } from '@/components/shell/Icon';
import { clockLabel, fmtPm, hourLabel, sofiaDate } from '@/lib/aq/format';
import { levelNow, PROFILES, type Profile } from '@/lib/aq/levels';
import { SourceBar } from '@/components/aq/SourceBar';
import { dmy, lastWinterFallback, whatIfLine } from '@/lib/aq/sources';
import { t } from '@/lib/i18n';
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
  const m = forecast.model;
  const modelReady = source !== 'demo' && m.mae.model > 0;
  // The card is about Veliko Tarnovo: this season with the real weather forecast if we have it, else last winter's.
  const season = m.scoreboard?.replay;
  const vtSeason = season?.mae_pm25_next_day.vt;
  const vtWinter = m.mae_vt ?? m.mae;
  const whatIf = station.daily.some((d) => d.sources) && m.sources_what_if ? whatIfLine(m.sources_what_if, lang) : null;
  // Clean coming days hide their own shares: show last winter's so „Кой замърсява?“ is always on the page.
  const lastWinter = lastWinterFallback(days, m.sources_what_if);
  const short = (d: string) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}`;

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

          <StationPicker stations={forecast.stations} station={station.id} profile={profile} lang={lang} action="/now" />
        </section>

        <aside className="card insight air-model" aria-labelledby="model-title">
          <h2 className="card-title" id="model-title">
            <Icon name="sparkle" />
            {tr('web.model.title')}
          </h2>
          <p className="insight-text">
            {!modelReady
              ? tr('web.model.pending')
              : season && vtSeason
                ? tr('web.model.season', {
                    from: short(season.from),
                    to: short(season.to),
                    model: fmtPm(lang, vtSeason.model),
                    cams: fmtPm(lang, vtSeason.cams),
                  })
                : tr('web.model.vt', {
                    model: fmtPm(lang, vtWinter.model),
                    cams: fmtPm(lang, vtWinter.cams),
                    persistence: fmtPm(lang, vtWinter.persistence),
                  })}
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
              camsNote: tr('web.chart.camsnote'),
              readout: tr('web.chart.readout', { time: '{time}', value: '{value}' }),
            }}
          />
          <p className="note">
            {tr('air.source')} · {clockLabel(lang, forecast.generated_at)}
          </p>
        </section>
      )}

      {days.length > 0 && <DayCards days={days} lang={lang} today={today} tomorrow={tomorrow} />}
      {lastWinter ? (
        <section className="card" aria-labelledby="src-title">
          <h2 className="card-title" id="src-title">
            {tr('src.season.title')}
          </h2>
          <p className="card-sub">
            {lastWinter.from && lastWinter.to
              ? tr('src.season.sub', { from: dmy(lastWinter.from), to: dmy(lastWinter.to) })
              : tr('src.season.sub.plain')}
          </p>
          <SourceBar sources={lastWinter.shares} lang={lang} />
          {whatIf && <p className="insight-text what-if">{whatIf}</p>}
        </section>
      ) : (
        whatIf && <p className="note what-if">{whatIf}</p>
      )}

      <ExplainCard
        station={station.id}
        profile={profile}
        lang={lang}
        labels={{
          title: tr('ex.title'),
          sub: tr('ex.sub'),
          button: tr('ex.button', { profile: profileName(lang, profile) }),
          loading: tr('ex.loading'),
          error: tr('ex.error'),
          cached: t(lang, 'summary.cached'),
          provider: {
            groq: t(lang, 'summary.provider.groq'),
            gemini: t(lang, 'summary.provider.gemini'),
            mock: t(lang, 'summary.provider.mock'),
          },
        }}
      />
    </AppShell>
  );
}
