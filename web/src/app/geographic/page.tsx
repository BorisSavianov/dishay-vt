import type { Metadata } from 'next';
import { StationMap } from '@/components/aq/StationMap';
import { AppShell } from '@/components/shell/AppShell';
import { hourLabel } from '@/lib/aq/format';
import { mapFrames } from '@/lib/aq/frames';
import { loadForecast } from '@/lib/aq/load';
import { air, type AirKey } from '@/lib/aq/strings';
import { bundledRegion, loadDatasets } from '@/lib/data';
import { t } from '@/lib/i18n';
import { langOf, type SearchParams } from '@/lib/page';
import { sourceLine } from '@/lib/sources';

export const dynamic = 'force-dynamic';

const HEALTH_TYPES = new Set(['pharmacy', 'hospital', 'clinic', 'doctors']);

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: `${t(lang, 'nav.geo')} · ${t(lang, 'brand.name')}`, description: air(lang, 'web.map.lead') };
}

export default async function AirMap({ searchParams }: { searchParams: SearchParams }) {
  const lang = langOf(await searchParams);
  const tr = (key: AirKey, vars?: Record<string, string | number>) => air(lang, key, vars);
  const [{ source, forecast }, { datasets }] = await Promise.all([loadForecast(), loadDatasets()]);
  const frames = mapFrames(forecast, new Date());
  const health = datasets.facilities.points.filter((p) => HEALTH_TYPES.has(p.type));

  return (
    <AppShell lang={lang} active="geo" title={tr('air.map.title')} lead={tr('web.map.lead')} updated={forecast.generated_at}>
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
      <section className="card" aria-labelledby="map-title">
        <div className="card-head">
          <div>
            <h2 className="card-title" id="map-title">
              {tr('air.map.title')}
            </h2>
            <p className="card-sub">{tr('web.map.count', { count: frames.stations.length })}</p>
          </div>
          <span className="pill">{tr('web.generated', { time: hourLabel(lang, forecast.generated_at) })}</span>
        </div>
        <StationMap
          frames={frames}
          timeLabels={frames.times.map((time) => hourLabel(lang, time))}
          health={health}
          region={bundledRegion.geometry}
          lang={lang}
          labels={{
            alt: tr('web.map.alt'),
            fallback: tr('web.map.fallback'),
            hour: tr('web.map.hour'),
            play: tr('web.map.play'),
            pause: tr('web.map.pause'),
            view: tr('web.map.view'),
            vt: tr('web.map.vt'),
            bg: tr('web.map.bg'),
            health: tr('web.map.health'),
            open: tr('web.map.open'),
            legend: tr('web.map.legend'),
            nodata: tr('web.map.nodata'),
            table: tr('web.map.table'),
            now: tr('web.chart.now'),
            ahead: tr('web.map.ahead', { hours: '{hours}' }),
            station: tr('air.station'),
            city: tr('web.map.city'),
            level: tr('web.map.level'),
            zoomIn: t(lang, 'map.zoom.in'),
            zoomOut: t(lang, 'map.zoom.out'),
            resetNorth: t(lang, 'map.reset'),
          }}
        />
        <p className="note">{tr('air.source')}</p>
        <p className="note">{sourceLine(lang, datasets.facilities.meta)}</p>
      </section>
    </AppShell>
  );
}
