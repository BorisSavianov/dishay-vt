import { donutSegments } from '@/lib/chart';
import { fmtInt, fmtNum } from '@/lib/format';
import { typeColor } from '@/lib/palette';
import type { Lang } from '@/lib/types';

export type DonutPart = { type: string; label: string; count: number; share: number };

const R = 70;
const C = 2 * Math.PI * R;

// Donut of the parts, with the total in the middle and a legend of counts and shares.
export function Donut({
  parts,
  total,
  totalLabel,
  alt,
  lang,
}: {
  parts: DonutPart[];
  total: number;
  totalLabel: string;
  alt: string;
  lang: Lang;
}) {
  const segments = donutSegments(
    parts.map((p) => p.count),
    C,
    3,
  );
  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 190 190" role="img" aria-label={alt}>
        <g transform="rotate(-90 95 95)">
          <circle className="ring" cx={95} cy={95} r={R} stroke="var(--grid)" />
          {parts.map((p, i) => (
            <circle
              key={p.type}
              className="ring"
              cx={95}
              cy={95}
              r={R}
              stroke={typeColor(p.type)}
              strokeDasharray={`${segments[i]!.length} ${C}`}
              strokeDashoffset={segments[i]!.offset}
            />
          ))}
        </g>
        <text className="donut-total" x={95} y={97}>
          {fmtInt(lang, total)}
        </text>
        <text className="donut-caption" x={95} y={117}>
          {totalLabel}
        </text>
      </svg>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.type} className="legend-row">
            <span className="swatch" style={{ background: typeColor(p.type) }} />
            <span>{p.label}</span>
            <span className="num">{fmtInt(lang, p.count)}</span>
            <span className="share">{fmtNum(lang, p.share, 1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
