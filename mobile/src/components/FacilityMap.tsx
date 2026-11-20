import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { useColors } from '../lib/color-mode';
import { projectToUnit } from '../shared/geo';
import type { Lang } from '../shared/types';
import type { PointType } from '../theme/palette';
import { MapLegend, type MapType } from './MapLegend';

export type { MapType };

export type MapPoint = { lat: number; lon: number; type: string };

const W = 400;
const H = 300;
const PAD = 22;

// Every facility as a dot at its real position. The legend chips filter by type. The data has no
// municipality boundaries, so this is a dot map, not a choropleth.
export function FacilityMap({
  points,
  types,
  lang,
  alt,
  typeHeading,
  shownLabel,
}: {
  points: MapPoint[];
  types: MapType[];
  lang: Lang;
  alt: string;
  typeHeading: string;
  shownLabel: string; // has {count} and {total}
}) {
  const c = useColors();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(0);
  const colourOf = (type: string) => c.points[type as PointType] ?? c.muted;

  const dots = useMemo(() => {
    const p = projectToUnit(points);
    const scale = Math.min(W - PAD * 2, H - PAD * 2);
    return points.map((pt, i) => ({ type: pt.type, x: W / 2 + p[i]!.x * scale, y: H / 2 - p[i]!.y * scale }));
  }, [points]);

  const layers = [...types.map((t) => t.type)].reverse(); // bus stops first, health facilities on top
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
    <View style={{ gap: 14 }}>
      <View accessible accessibilityRole="image" accessibilityLabel={alt} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={[styles.map, { backgroundColor: c.card2, borderColor: c.line }]}>
        <Svg width={Math.max(width - 2, 0)} height={((width - 2) * H) / W} viewBox={`0 0 ${W} ${H}`}>
          {[0.25, 0.5, 0.75].map((f) => (
            <G key={f}>
              <Line x1={W * f} x2={W * f} y1={0} y2={H} stroke={c.grid} strokeWidth={1} />
              <Line x1={0} x2={W} y1={H * f} y2={H * f} stroke={c.grid} strokeWidth={1} />
            </G>
          ))}
          {layers.map((type) =>
            hidden.has(type)
              ? null
              : dots
                  .filter((d) => d.type === type)
                  .map((d, i) => (
                    <Circle
                      key={`${type}-${i}`}
                      cx={d.x}
                      cy={d.y}
                      r={type === 'bus_stop' ? 3 : 5}
                      fill={colourOf(type)}
                      fillOpacity={type === 'bus_stop' ? 0.55 : 0.92}
                    />
                  )),
          )}
        </Svg>
        </View>
      </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  map: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
});
