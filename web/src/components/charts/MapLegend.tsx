'use client';

import { fmtInt } from '@/lib/format';
import { typeColor } from '@/lib/palette';
import type { Lang } from '@/lib/types';

export type MapType = { type: string; label: string; count: number };

// The type legend of both maps. Each row is a filter: press a type to hide or show it.
export function MapLegend({
  types,
  hidden,
  onToggle,
  lang,
  typeHeading,
  shownLabel,
  shown,
  total,
}: {
  types: MapType[];
  hidden: Set<string>;
  onToggle: (type: string) => void;
  lang: Lang;
  typeHeading: string;
  shownLabel: string; // has {count} and {total}
  shown: number;
  total: number;
}) {
  return (
    <div>
      <p className="legend-title">{typeHeading}</p>
      <div className="legend">
        {types.map((ty) => (
          <button
            key={ty.type}
            type="button"
            className="legend-row"
            aria-pressed={!hidden.has(ty.type)}
            onClick={() => onToggle(ty.type)}
          >
            <span className="swatch" style={{ background: typeColor(ty.type) }} />
            <span>{ty.label}</span>
            <span className="num">{fmtInt(lang, ty.count)}</span>
          </button>
        ))}
      </div>
      <p className="note" aria-live="polite">
        {shownLabel.replace('{count}', fmtInt(lang, shown)).replace('{total}', fmtInt(lang, total))}
      </p>
    </div>
  );
}
