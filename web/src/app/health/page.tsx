import type { Metadata } from 'next';
import { Donut } from '@/components/charts/Donut';
import { TrendChart } from '@/components/charts/TrendChart';
import { AppShell } from '@/components/shell/AppShell';
import { loadDatasets } from '@/lib/data';
import { typeLabel } from '@/lib/facts';
import { fmtInt } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { span, splitFacilities, updatedAt } from '@/lib/metrics';
import { langOf, type SearchParams } from '@/lib/page';
import { sourceLine } from '@/lib/sources';

export const revalidate = 300;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: `${t(lang, 'nav.health')} · ${t(lang, 'brand.name')}`, description: t(lang, 'health.lead') };
}

export default async function Health({ searchParams }: { searchParams: SearchParams }) {
  const lang = langOf(await searchParams);
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const { source, datasets } = await loadDatasets();
  const series = datasets.physicians.series;
  const physSpan = span(series);
  const split = splitFacilities(datasets.facilities.counts);

  return (
    <AppShell
      lang={lang}
      active="health"
      title={tr('nav.health')}
      lead={tr('health.lead')}
      updated={updatedAt(datasets)}
      bundled={source === 'bundled'}
      exportable
    >
      <div className="stack">
        <section className="card">
          <TrendChart
            series={series}
            lang={lang}
            digits={2}
            labels={{
              title: tr('health.trend.title'),
              subtitle: tr('health.trend.sub'),
              type: tr('trend.type'),
              line: tr('trend.line'),
              area: tr('trend.area'),
              bar: tr('trend.bar'),
              alt: physSpan
                ? tr('trend.alt', { title: tr('health.trend.title'), first: physSpan.first.year, last: physSpan.last.year })
                : tr('health.trend.title'),
              table: tr('trend.table'),
              year: tr('trend.year'),
              valueLabel: tr('summary.card.physicians'),
              readout: tr('trend.readout', { label: tr('health.trend.title') }),
            }}
          />
          <p className="note">{tr('health.note')}</p>
          <p className="note">{sourceLine(lang, datasets.physicians.meta)}</p>
        </section>

        <section className="card" aria-labelledby="fac-title">
          <div className="card-head">
            <h2 className="card-title" id="fac-title">
              {tr('health.facilities.title')}
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
          <p className="note">{sourceLine(lang, datasets.facilities.meta)}</p>
        </section>
      </div>
    </AppShell>
  );
}
