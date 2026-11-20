import { linePath, niceTicks } from '@/lib/chart';
import { sofiaHour } from '@/lib/aq/format';
import type { EpisodeHour } from '@/lib/aq/episode';

const W = 640;
const H = 280;
const M = { top: 14, right: 16, bottom: 30, left: 40 };

// One day, hour by hour, PM2.5: what was measured, our forecast from the day before with its likely range,
// CAMS dashed, and the line where the air becomes "moderate" (level 3, sensitive groups are warned).
export function EpisodeChart({
  observed,
  forecast,
  cams,
  threshold,
  alt,
  labels,
  format,
}: {
  observed: EpisodeHour[];
  forecast: EpisodeHour[];
  cams: EpisodeHour[];
  threshold: number;
  alt: string;
  labels: { observed: string; forecast: string; band: string; cams: string; threshold: string };
  format: (n: number) => string;
}) {
  const all = [...observed, ...forecast, ...cams].flatMap((h) => [h.pm25, h.pm25_hi ?? 0]);
  const ticks = niceTicks(0, Math.max(...all, threshold * 1.2), 5);
  const yMax = ticks[ticks.length - 1] ?? 1;
  const n = Math.max(observed.length, forecast.length, cams.length);
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const x = (i: number) => M.left + (innerW * i) / Math.max(n - 1, 1);
  const y = (v: number) => M.top + innerH - (Math.min(v, yMax) / yMax) * innerH;
  const path = (hs: EpisodeHour[]) => linePath(hs.map((h, i) => ({ x: x(i), y: y(h.pm25) })));
  const hasBand = forecast.every((h) => h.pm25_lo != null && h.pm25_hi != null);
  const band = hasBand
    ? `${linePath(forecast.map((h, i) => ({ x: x(i), y: y(h.pm25_hi!) })))} ${forecast
        .map((h, i) => ({ x: x(i), y: y(h.pm25_lo!) }))
        .reverse()
        .map((p) => `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ')} Z`
    : null;

  return (
    <figure className="line-chart episode-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {observed.map((h, i) => {
          const hr = sofiaHour(new Date(h.t));
          return hr % 6 === 0 ? (
            <text key={h.t} x={x(i)} y={H - 8} textAnchor="middle">
              {`${String(hr).padStart(2, '0')}:00`}
            </text>
          ) : null;
        })}
        <line className="ep-threshold" x1={M.left} x2={W - M.right} y1={y(threshold)} y2={y(threshold)} />
        {band && <path className="ep-band" d={band} />}
        <path className="ep-cams" d={path(cams)} />
        <path className="ep-forecast" d={path(forecast)} />
        <path className="ep-observed" d={path(observed)} />
      </svg>
      <figcaption className="lc-legend">
        <span>
          <span className="lc-key ep-key-observed" aria-hidden="true" />
          {labels.observed}
        </span>
        <span>
          <span className="lc-key ep-key-forecast" aria-hidden="true" />
          {labels.forecast}
        </span>
        {band && (
          <span>
            <span className="lc-key ep-key-band" aria-hidden="true" />
            {labels.band}
          </span>
        )}
        <span>
          <span className="lc-key ep-key-cams" aria-hidden="true" />
          {labels.cams}
        </span>
        <span>
          <span className="lc-key ep-key-threshold" aria-hidden="true" />
          {labels.threshold}
        </span>
      </figcaption>
    </figure>
  );
}
