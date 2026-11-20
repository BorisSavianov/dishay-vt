import type { Metadata } from 'next';
import Link from 'next/link';
import { Donut } from '@/components/charts/Donut';
import { LiveMap } from '@/components/charts/LiveMap';
import { TrendChart } from '@/components/charts/TrendChart';
import { Kpi } from '@/components/Kpi';
import { AppShell } from '@/components/shell/AppShell';
import { Icon } from '@/components/shell/Icon';
import { bundledRegion, loadDatasets } from '@/lib/data';
import { changePct, fmtInt, fmtNum, fmtPct } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { insightText } from '@/lib/insight';
import { cagr, span, splitFacilities, updatedAt } from '@/lib/metrics';
import { langOf, withLang, type SearchParams } from '@/lib/page';
import { orderTypes } from '@/lib/palette';
import { regionCaveat } from '@/lib/pin';
import { sourceLine } from '@/lib/sources';
import { typeLabel } from '@/lib/facts';

export const revalidate = 300;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: t(lang, 'site.title'), description: t(lang, 'site.lead') };
}

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const lang = langOf(await searchParams);
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const { source, datasets } = await loadDatasets();

  const pop = datasets.population.series;
  const popSpan = span(pop);
  const phys = datasets.physicians.series[datasets.physicians.series.length - 1];
  const split = splitFacilities(datasets.facilities.counts);
  const insight = insightText(lang, pop);

  const types = orderTypes(Object.keys(datasets.facilities.counts));
  const mapTypes = types.map((type) => ({
    type,
    label: typeLabel(lang, type),
    count: datasets.facilities.counts[type] ?? 0,
  }));

  const pct = popSpan ? changePct(popSpan.first.value, popSpan.last.value) : null;
  const rate = popSpan ? cagr(popSpan.first.value, popSpan.last.value, popSpan.years) : null;

  return (
    <AppShell
      lang={lang}
      active="dashboard"
      title={tr('dash.title')}
      lead={tr('site.lead')}
      updated={updatedAt(datasets)}
      bundled={source === 'bundled'}
      exportable
    >
      <section className="kpis" aria-label={tr('nav.dashboard')}>
        {popSpan && pct !== null && (
          <Kpi primary icon="users" label={tr('kpi.population.label', { year: popSpan.last.year })} value={fmtInt(lang, popSpan.last.value)}>
            <span className={`delta ${pct < 0 ? 'is-neg' : 'is-pos'}`}>
              <span aria-hidden="true">{pct < 0 ? '▼' : '▲'}</span>
              {fmtPct(lang, pct)}
            </span>
            {tr('kpi.population.vs', { year: popSpan.first.year })}
          </Kpi>
        )}
        {popSpan && rate !== null && (
          <Kpi icon={rate < 0 ? 'trendDown' : 'trendUp'} label={tr('kpi.change.label')} value={fmtPct(lang, rate, 2)}>
            {tr('kpi.change.sub', { first: popSpan.first.year, last: popSpan.last.year })}
          </Kpi>
        )}
        {phys && (
          <Kpi icon="activity" label={tr('kpi.physicians.label')} value={fmtNum(lang, phys.value, 2)}>
            {tr('kpi.physicians.sub', { year: phys.year })}
          </Kpi>
        )}
        <Kpi icon="building" label={tr('kpi.facilities.label')} value={fmtInt(lang, split.healthTotal)}>
          {tr('kpi.facilities.sub', { count: fmtInt(lang, split.busStops) })}
        </Kpi>
      </section>

      <div className="row-trend">
        <section className="card">
          <TrendChart
            series={pop}
            lang={lang}
            labels={{
              title: tr('trend.title'),
              subtitle: tr('trend.sub'),
              type: tr('trend.type'),
              line: tr('trend.line'),
              area: tr('trend.area'),
              bar: tr('trend.bar'),
              alt: popSpan
                ? tr('trend.alt', { title: tr('trend.title'), first: popSpan.first.year, last: popSpan.last.year })
                : tr('trend.title'),
              table: tr('trend.table'),
              year: tr('trend.year'),
              valueLabel: tr('summary.card.population'),
              readout: tr('trend.readout', { label: tr('trend.title') }),
            }}
          />
          <p className="note">{sourceLine(lang, datasets.population.meta)}</p>
        </section>

        <aside className="card insight" aria-labelledby="insight-title">
          <h2 className="card-title" id="insight-title">
            <Icon name="sparkle" />
            {tr('insight.title')}
          </h2>
          {insight && <p className="insight-text">{insight}</p>}
          <Link className="btn insight-cta" href={withLang('/insights', lang)}>
            {tr('insight.cta')}
            <Icon name="arrow" />
          </Link>
        </aside>
      </div>

      <div className="row-split">
        <section className="card" aria-labelledby="donut-title">
          <div className="card-head">
            <h2 className="card-title" id="donut-title">
              {tr('donut.title')}
            </h2>
          </div>
          <Donut
            lang={lang}
            total={split.healthTotal}
            totalLabel={tr('donut.total')}
            alt={tr('donut.title')}
            parts={split.health.map((h) => ({ ...h, label: typeLabel(lang, h.type) }))}
          />
          <p className="note">{tr('donut.note', { count: fmtInt(lang, split.busStops) })}</p>
        </section>

        <section className="card" aria-labelledby="map-title">
          <div className="card-head">
            <h2 className="card-title" id="map-title">
              {tr('map.title')}
            </h2>
            <Link className="btn" href={withLang('/geographic', lang)}>
              {tr('dash.map.open')}
              <Icon name="arrow" />
            </Link>
          </div>
          <LiveMap
            interactive={false}
            points={datasets.facilities.points}
            types={mapTypes}
            region={bundledRegion.geometry}
            lang={lang}
            labels={{
              alt: tr('map.alt'),
              typeHeading: tr('map.type'),
              shownLabel: tr('map.count'),
              fallback: tr('map.fallback'),
              zoomIn: tr('map.zoom.in'),
              zoomOut: tr('map.zoom.out'),
              resetNorth: tr('map.reset'),
            }}
          />
          <p className="note">{regionCaveat(lang, bundledRegion.check)}</p>
          <p className="note">{sourceLine(lang, datasets.facilities.meta)}</p>
        </section>
      </div>
    </AppShell>
  );
}
