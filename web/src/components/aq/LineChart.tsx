import { linePath, niceTicks } from '@/lib/chart';

export type Line = { name: string; className: string; values: number[] };

const W = 480;
const H = 250;
const M = { top: 14, right: 16, bottom: 34, left: 44 };

// A small server-rendered line chart for a few series on shared x labels. Scales with its box; the
// numbers are in a table next to it, so the picture never has to carry them alone.
export function LineChart({
  xLabels,
  lines,
  alt,
  axis,
  format,
}: {
  xLabels: string[];
  lines: Line[];
  alt: string;
  axis?: string;
  format: (n: number) => string;
}) {
  const all = lines.flatMap((l) => l.values);
  const ticks = niceTicks(0, Math.max(...all, 1), 5);
  const yMax = ticks[ticks.length - 1] ?? 1;
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const x = (i: number) => M.left + (xLabels.length === 1 ? innerW / 2 : (innerW * i) / (xLabels.length - 1));
  const y = (v: number) => M.top + innerH - (v / yMax) * innerH;

  return (
    <figure className="line-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {xLabels.map((label, i) => (
          <text key={i} x={x(i)} y={H - (axis ? 16 : 8)} textAnchor="middle">
            {label}
          </text>
        ))}
        {axis && (
          <text x={M.left + innerW / 2} y={H - 1} textAnchor="middle" className="axis-label">
            {axis}
          </text>
        )}
        {lines.map((l) => (
          <g key={l.name} className={l.className}>
            <path className="lc-line" d={linePath(l.values.map((v, i) => ({ x: x(i), y: y(v) })))} />
            {l.values.map((v, i) => (
              <circle key={i} className="lc-dot" cx={x(i)} cy={y(v)} r={3.5} />
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="lc-legend">
        {lines.map((l) => (
          <span key={l.name} className={l.className}>
            <span className="lc-key" aria-hidden="true" />
            {l.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
