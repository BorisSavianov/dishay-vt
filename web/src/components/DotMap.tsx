import { typeLabel } from '@/lib/facts';
import { fmtInt } from '@/lib/format';
import type { Lang, Point } from '@/lib/types';

// Colour helps, but the legend below names every type with its count.
const COLORS: Record<string, string> = {
  pharmacy: '#1b7f5f',
  hospital: '#b42318',
  clinic: '#175cd3',
  doctors: '#6941c6',
  bus_stop: '#667085',
};

export function DotMap({
  points,
  counts,
  lang,
  alt,
}: {
  points: Point[];
  counts: Record<string, number>;
  lang: Lang;
  alt: string;
}) {
  if (points.length === 0) return null;
  const W = 480;
  const H = 360;
  const PAD = 16;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = (maxLon - minLon) * k || 1e-6;
  const spanY = maxLat - minLat || 1e-6;
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  const x = (lon: number) => offX + (lon - minLon) * k * scale;
  const y = (lat: number) => offY + (maxLat - lat) * scale;

  return (
    <figure className="map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt}>
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(p.lon)}
            cy={y(p.lat)}
            r={p.type === 'bus_stop' ? 2.5 : 4}
            fill={COLORS[p.type] ?? '#344054'}
            fillOpacity={0.85}
          />
        ))}
      </svg>
      <ul className="legend">
        {Object.entries(counts).map(([type, n]) => (
          <li key={type}>
            <span className="swatch" style={{ background: COLORS[type] ?? '#344054' }} aria-hidden="true" />
            {fmtInt(lang, n)} {typeLabel(lang, type)}
          </li>
        ))}
      </ul>
    </figure>
  );
}
