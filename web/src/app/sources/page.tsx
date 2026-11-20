import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import { loadDatasets } from '@/lib/data';
import { fmtInt } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { span, updatedAt } from '@/lib/metrics';
import { langOf, type SearchParams } from '@/lib/page';
import type { DatasetName } from '@/lib/types';

export const revalidate = 300;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: `${t(lang, 'nav.sources')} · ${t(lang, 'brand.name')}`, description: t(lang, 'sources.lead') };
}

export default async function Sources({ searchParams }: { searchParams: SearchParams }) {
  const lang = langOf(await searchParams);
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const { source, datasets } = await loadDatasets();

  const popSpan = span(datasets.population.series);
  const physSpan = span(datasets.physicians.series);
  const rows: { name: DatasetName; meta: (typeof datasets)[DatasetName]['meta']; coverage: string }[] = [
    {
      name: 'population',
      meta: datasets.population.meta,
      coverage: popSpan ? tr('sources.coverage.population', { first: popSpan.first.year, last: popSpan.last.year }) : '',
    },
    {
      name: 'physicians',
      meta: datasets.physicians.meta,
      coverage: physSpan ? tr('sources.coverage.physicians', { first: physSpan.first.year, last: physSpan.last.year }) : '',
    },
    {
      name: 'facilities',
      meta: datasets.facilities.meta,
      coverage: tr('sources.coverage.facilities', { count: fmtInt(lang, datasets.facilities.points.length) }),
    },
  ];

  return (
    <AppShell
      lang={lang}
      active="sources"
      title={tr('nav.sources')}
      lead={tr('sources.lead')}
      updated={updatedAt(datasets)}
      bundled={source === 'bundled'}
      exportable
    >
      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{tr('sources.col.dataset')}</th>
                <th scope="col">{tr('sources.col.source')}</th>
                <th scope="col">{tr('sources.col.coverage')}</th>
                <th scope="col">{tr('sources.col.asof')}</th>
                <th scope="col">{tr('sources.col.license')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <th scope="row">{tr(`summary.card.${r.name}` as MessageKey)}</th>
                  <td>{r.meta.source}</td>
                  <td>{r.coverage}</td>
                  <td>{r.meta.as_of}</td>
                  <td>{r.meta.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
