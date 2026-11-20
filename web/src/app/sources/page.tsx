import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import { hourLabel } from '@/lib/aq/format';
import { loadForecast } from '@/lib/aq/load';
import { air, type AirKey } from '@/lib/aq/strings';
import { loadDatasets } from '@/lib/data';
import { fmtInt } from '@/lib/format';
import { t } from '@/lib/i18n';
import { langOf, type SearchParams } from '@/lib/page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: `${t(lang, 'nav.sources')} · ${t(lang, 'brand.name')}`, description: air(lang, 's.lead') };
}

type Row = { name: string; href: string; use: AirKey; license: string; asOf?: string };

// Licences as the sources state them (checked 2026-11-20, docs/sources.md).
const ROWS: Row[] = [
  { name: 'sensor.community (Luftdaten)', href: 'https://sensor.community', use: 's.sc', license: 'ODbL' },
  {
    name: 'Open-Meteo, historical weather (ERA5)',
    href: 'https://open-meteo.com/en/docs/historical-weather-api',
    use: 's.era5',
    license: 'CC BY 4.0; contains modified Copernicus Climate Change Service information',
  },
  { name: 'Open-Meteo, weather forecast', href: 'https://open-meteo.com/en/docs', use: 's.forecast', license: 'CC BY 4.0' },
  {
    name: 'CAMS Europe (Copernicus), via Open-Meteo Air Quality',
    href: 'https://open-meteo.com/en/docs/air-quality-api',
    use: 's.cams',
    license: 'Generated using Copernicus Atmosphere Monitoring Service information 2026',
  },
  { name: 'OpenStreetMap (Overpass API)', href: 'https://www.openstreetmap.org/copyright', use: 's.osm', license: 'ODbL' },
  {
    name: 'Open-Meteo, elevation (Copernicus DEM GLO-90)',
    href: 'https://open-meteo.com/en/docs/elevation-api',
    use: 's.elev',
    license: 'CC BY 4.0',
  },
  {
    name: 'EEA European Air Quality Index (2024)',
    href: 'https://airindex.eea.europa.eu/AQI/index.html',
    use: 's.eaqi',
    license: 'EEA, reuse with acknowledgement',
  },
  {
    name: 'Eurostat sdg_11_52',
    href: 'https://ec.europa.eu/eurostat/databrowser/view/sdg_11_52/default/table',
    use: 's.eurostat',
    license: 'Eurostat reuse policy: reuse with source acknowledged',
    asOf: '2025-12-09',
  },
  { name: 'OpenFreeMap vector tiles', href: 'https://openfreemap.org', use: 's.tiles', license: 'MIT; map data ODbL (OpenStreetMap)' },
];

export default async function Sources({ searchParams }: { searchParams: SearchParams }) {
  const lang = langOf(await searchParams);
  const tr = (key: AirKey, vars?: Record<string, string | number>) => air(lang, key, vars);
  const [{ forecast }, { datasets }] = await Promise.all([loadForecast(), loadDatasets()]);
  const osm = datasets.facilities.meta;

  return (
    <AppShell lang={lang} active="sources" title={t(lang, 'nav.sources')} lead={tr('s.lead')} updated={forecast.generated_at}>
      <p className="notice live-note" role="status">
        {tr('s.live', {
          model: forecast.model.name,
          stations: fmtInt(lang, forecast.stations.length),
          time: hourLabel(lang, forecast.generated_at),
        })}
      </p>
      <section className="card">
        <div className="table-wrap">
          <table className="table sources-table">
            <thead>
              <tr>
                <th scope="col">{tr('s.col.source')}</th>
                <th scope="col">{tr('s.col.use')}</th>
                <th scope="col">{tr('s.col.license')}</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name}>
                  <th scope="row">
                    <a href={r.href} target="_blank" rel="noopener noreferrer">
                      {r.name}
                    </a>
                    {r.asOf && <small>{r.asOf}</small>}
                    {r.use === 's.osm' && <small>{osm.as_of}</small>}
                  </th>
                  <td>{tr(r.use)}</td>
                  <td>{r.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
