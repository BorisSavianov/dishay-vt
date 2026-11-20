'use client';

import { useMemo, useState } from 'react';
import { projectToUnit } from '@/lib/geo';
import { typeColor } from '@/lib/palette';
import type { Lang } from '@/lib/types';
import { MapLegend, type MapType } from './MapLegend';

export type { MapType };
export type MapPoint = { lat: number; lon: number; type: string };

const W = 400;
const H = 300;
const PAD = 22;

// The fallback map: every facility as a dot at its real position, with no basemap. The legend doubles as a filter: press a type to hide or show it.
// There are no municipality boundaries in the data, so this is a dot map, not a choropleth.
export function FacilityMap({
  points,
  types,
  lang,
  alt,
  typeHeading,
  shownLabel,
  large = false,
}: {
  points: MapPoint[];
  types: MapType[];
  lang: Lang;
  alt: string;
  typeHeading: string;
  shownLabel: string; // has {count} and {total}
  large?: boolean;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const projected = useMemo(() => projectToUnit(points), [points]);
  const scale = Math.min(W - PAD * 2, H - PAD * 2);
  const dots = useMemo(
    () => points.map((p, i) => ({ type: p.type, x: W / 2 + projected[i]!.x * scale, y: H / 2 - projected[i]!.y * scale })),
    [points, projected, scale],
  );
  const order = types.map((t) => t.type);
  // Bus stops (the last type) are drawn first so the health facilities sit on top.
  const layers = [...order].reverse();
  const shown = dots.filter((d) => !hidden.has(d.type)).length;

  function toggle(type: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <div className={`map${large ? ' map-lg' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt}>
        {[0.25, 0.5, 0.75].map((f) => (
          <g key={f} stroke="var(--grid)" strokeWidth={1}>
            <line x1={W * f} x2={W * f} y1={0} y2={H} />
            <line x1={0} x2={W} y1={H * f} y2={H * f} />
          </g>
        ))}
        {layers.map((type) =>
          hidden.has(type) ? null : (
            <g key={type} fill={typeColor(type)} fillOpacity={type === 'bus_stop' ? 0.55 : 0.92}>
              {dots
                .filter((d) => d.type === type)
                .map((d, i) => (
                  <circle key={i} cx={d.x} cy={d.y} r={type === 'bus_stop' ? 3 : 5} />
                ))}
            </g>
          ),
        )}
      </svg>
      <MapLegend
        types={types}
        hidden={hidden}
        onToggle={toggle}
        lang={lang}
        typeHeading={typeHeading}
        shownLabel={shownLabel}
        shown={shown}
        total={dots.length}
      />
    </div>
  );
}
