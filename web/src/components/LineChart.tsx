import { fmtInt } from '@/lib/format';
import type { Lang, Series } from '@/lib/types';

export function LineChart({
  series,
  lang,
  title,
  alt,
}: {
  series: Series['series'];
  lang: Lang;
  title: string;
  alt: string;
}) {
  if (series.length === 0) return null;
  const W = 640;
  const H = 280;
  const PAD = { l: 64, r: 20, t: 24, b: 40 };
  const years = series.map((p) => p.year);
  const values = series.map((p) => p.value);
  const x0 = Math.min(...years);
  const x1 = Math.max(...years);
  const yMin = Math.floor(Math.min(...values) * 0.97);
  const yMax = Math.ceil(Math.max(...values) * 1.02);
  const sx = (year: number) => PAD.l + ((year - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);
  const d = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.year).toFixed(1)},${sy(p.value).toFixed(1)}`)
    .join(' ');
  const first = series[0]!;
  const last = series[series.length - 1]!;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt}>
        <title>{title}</title>
        <line x1={PAD.l} x2={W - PAD.r} y1={sy(yMin)} y2={sy(yMin)} className="axis" />
        <text x={PAD.l - 8} y={sy(yMax) + 4} textAnchor="end" className="tick">
          {fmtInt(lang, yMax)}
        </text>
        <text x={PAD.l - 8} y={sy(yMin)} textAnchor="end" className="tick">
          {fmtInt(lang, yMin)}
        </text>
        <path d={d} fill="none" className="line" />
        {series.map((p) => (
          <g key={p.year}>
            <circle cx={sx(p.year)} cy={sy(p.value)} r={3.5} className="dot" />
            <text x={sx(p.year)} y={H - 14} textAnchor="middle" className="tick">
              {p.year}
            </text>
          </g>
        ))}
        <text x={sx(first.year)} y={sy(first.value) - 10} textAnchor="middle" className="label">
          {fmtInt(lang, first.value)}
        </text>
        <text x={sx(last.year)} y={sy(last.value) - 10} textAnchor="middle" className="label">
          {fmtInt(lang, last.value)}
        </text>
      </svg>
    </figure>
  );
}
