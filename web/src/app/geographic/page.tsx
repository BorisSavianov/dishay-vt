import type { Metadata } from 'next';
import { LiveMap } from '@/components/charts/LiveMap';
import { AppShell } from '@/components/shell/AppShell';
import { bundledRegion, loadDatasets } from '@/lib/data';
import { typeLabel } from '@/lib/facts';
import { t, type MessageKey } from '@/lib/i18n';
import { updatedAt } from '@/lib/metrics';
import { langOf, type SearchParams } from '@/lib/page';
import { orderTypes } from '@/lib/palette';
import { regionCaveat } from '@/lib/pin';
import { sourceLine } from '@/lib/sources';

export const revalidate = 300;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: `${t(lang, 'nav.geo')} · ${t(lang, 'brand.name')}`, description: t(lang, 'geo.lead') };
}

export default async function Geographic({ searchParams }: { searchParams: SearchParams }) {
  const lang = langOf(await searchParams);
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const { source, datasets } = await loadDatasets();
  const { facilities } = datasets;
  const types = orderTypes(Object.keys(facilities.counts)).map((type) => ({
    type,
    label: typeLabel(lang, type),
    count: facilities.counts[type] ?? 0,
  }));

  return (
    <AppShell
      lang={lang}
      active="geo"
      title={tr('nav.geo')}
      lead={tr('geo.lead')}
      updated={updatedAt(datasets)}
      bundled={source === 'bundled'}
      exportable
    >
      <section className="card" aria-labelledby="geo-title">
        <div className="card-head">
          <h2 className="card-title" id="geo-title">
            {tr('map.title')}
          </h2>
        </div>
        <LiveMap
          large
          points={facilities.points}
          types={types}
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
        <p className="note">{sourceLine(lang, bundledRegion.meta)}</p>
        <p className="note">{sourceLine(lang, facilities.meta)}</p>
      </section>
    </AppShell>
  );
}
