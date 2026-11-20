import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { LEVEL_COLORS, PM25_BANDS, levelOf } from '../aq/levels';
import type { AqHour } from '../aq/types';
import { useColors } from '../lib/color-mode';
import type { Lang } from '../shared/types';

const H = 220;
const M = { top: 12, right: 12, bottom: 24, left: 30 };

function path(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
}

function hourLabel(lang: Lang, iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-GB', { weekday: 'short' });
  return `${day} ${String(d.getHours()).padStart(2, '0')}:00`;
}

// 72-hour PM2.5 forecast: the likely band, our line, the CAMS line dashed, and the EAQI band edges in
// the background. Drag across it to read an hour.
export function ForecastChart({
  hourly,
  lang,
  labels,
}: {
  hourly: AqHour[];
  lang: Lang;
  labels: { ours: string; cams: string };
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<number | null>(null);

  const g = useMemo(() => {
    if (!width || hourly.length < 2) return null;
    const maxVal = Math.max(...hourly.map((h) => Math.max(h.pm25_hi ?? h.pm25, h.cams_pm25 ?? 0, h.pm25)));
    const top = Math.max(20, Math.ceil((maxVal * 1.1) / 10) * 10);
    const w = width - M.left - M.right;
    const h = H - M.top - M.bottom;
    const x = (i: number) => M.left + (i / (hourly.length - 1)) * w;
    const y = (v: number) => M.top + h - (Math.min(v, top) / top) * h;
    const line = path(hourly.map((p, i) => [x(i), y(p.pm25)]));
    const hasBand = hourly.every((p) => p.pm25_lo != null && p.pm25_hi != null);
    const band = hasBand
      ? path([
          ...hourly.map((p, i): [number, number] => [x(i), y(p.pm25_hi!)]),
          ...hourly.map((p, i): [number, number] => [x(i), y(p.pm25_lo!)]).reverse(),
        ]) + 'Z'
      : null;
    const cams = hourly.every((p) => p.cams_pm25 != null) ? path(hourly.map((p, i) => [x(i), y(p.cams_pm25!)])) : null;
    // Band edges below the top of the chart.
    const edges = [0, ...PM25_BANDS].filter((v) => v < top).map((v, i, arr) => ({
      level: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6,
      y0: y(arr[i + 1] ?? top),
      y1: y(v),
    }));
    // Midnight ticks.
    const days = hourly.flatMap((p, i) => (new Date(p.t).getHours() === 0 ? [i] : []));
    const ticks = [0, Math.round(top / 2), top];
    return { x, y, line, band, cams, edges, days, ticks, w };
  }, [hourly, width]);

  const pick = (px: number) => {
    if (!g) return;
    const i = Math.round(((px - M.left) / g.w) * (hourly.length - 1));
    const clamped = Math.max(0, Math.min(hourly.length - 1, i));
    if (clamped !== sel) void Haptics.selectionAsync();
    setSel(clamped);
  };

  const point = sel !== null ? hourly[sel] : null;

  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.readout, { backgroundColor: c.card2, borderColor: c.line }]}>
        {point ? (
          <>
            <View style={[styles.swatch, { backgroundColor: LEVEL_COLORS[levelOf(point.pm25, point.pm10)] }]} />
            <Text style={[styles.readoutText, { color: c.fg }]}>
              {hourLabel(lang, point.t)} · {point.pm25.toFixed(0)} µg/m³
              {point.cams_pm25 != null ? `  (CAMS ${point.cams_pm25.toFixed(0)})` : ''}
            </Text>
          </>
        ) : (
          <Text style={[styles.readoutText, { color: c.muted }]}>
            {lang === 'bg' ? 'Плъзнете по графиката за час' : 'Drag across the chart to read an hour'}
          </Text>
        )}
      </View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        onResponderRelease={() => setSel(null)}
        accessible
        accessibilityLabel={`${labels.ours}: PM2.5, 72 h`}
        style={{ height: H }}
      >
        {g ? (
          <Svg width={width} height={H}>
            {g.edges.map((e) => (
              <Rect key={e.level} x={M.left} y={e.y0} width={g.w} height={Math.max(0, e.y1 - e.y0)} fill={LEVEL_COLORS[e.level]} opacity={0.13} />
            ))}
            {g.ticks.map((v) => (
              <SvgText key={v} x={M.left - 6} y={g.y(v) + 4} fontSize={10} fill={c.muted} textAnchor="end">
                {v}
              </SvgText>
            ))}
            {g.days.map((i) => (
              <Line key={i} x1={g.x(i)} x2={g.x(i)} y1={M.top} y2={H - M.bottom} stroke={c.grid} strokeWidth={1} />
            ))}
            {g.days.map((i) => (
              <SvgText key={`l${i}`} x={g.x(i) + 4} y={H - 8} fontSize={10} fill={c.muted}>
                {new Date(hourly[i]!.t).toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-GB', { weekday: 'short' })}
              </SvgText>
            ))}
            {g.band ? <Path d={g.band} fill={c.accent} opacity={0.18} /> : null}
            {g.cams ? <Path d={g.cams} stroke={c.muted} strokeWidth={1.6} strokeDasharray="5,4" fill="none" /> : null}
            <Path d={g.line} stroke={c.accent} strokeWidth={2.6} fill="none" strokeLinejoin="round" />
            {point && sel !== null ? (
              <Line x1={g.x(sel)} x2={g.x(sel)} y1={M.top} y2={H - M.bottom} stroke={c.fg} strokeWidth={1} opacity={0.5} />
            ) : null}
          </Svg>
        ) : null}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: c.accent }]} />
          <Text style={[styles.legendText, { color: c.muted }]}>{labels.ours}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: c.muted, opacity: 0.6 }]} />
          <Text style={[styles.legendText, { color: c.muted }]}>{labels.cams}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  readoutText: { fontSize: 13, fontWeight: '600' },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 18, height: 3, borderRadius: 2 },
  legendText: { fontSize: 12 },
});
