import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useColors } from '../lib/color-mode';
import { labelStride, linePath, nearestIndex, niceTicks } from '../shared/chart';
import { fmtInt, fmtNum } from '../shared/format';
import type { Lang } from '../shared/types';
import { Segmented } from './Segmented';

type Mode = 'line' | 'area' | 'bar';

export type TrendLabels = {
  type: string;
  line: string;
  area: string;
  bar: string;
  alt: string;
  hint: string;
  readout: string; // has {year} and {value}
};

const H = 220;
const MARGIN = { top: 12, right: 18, bottom: 26 };

// Short axis numbers. Written out so it does not depend on the JS engine's compact number support.
function axisLabel(lang: Lang, n: number, digits: number): string {
  if (digits > 0) return fmtNum(lang, n, digits);
  if (Math.abs(n) < 1000) return fmtNum(lang, n);
  const k = n / 1000;
  return `${fmtNum(lang, k, Number.isInteger(k) ? 0 : 1)}${lang === 'bg' ? ' хил.' : 'k'}`;
}

// Line, Area or Bar trend chart. Touch or drag across it to read other years. Bars start at zero.
export function TrendChart({
  series,
  lang,
  labels,
  digits = 0,
}: {
  series: { year: number; value: number }[];
  lang: Lang;
  labels: TrendLabels;
  digits?: number;
}) {
  const c = useColors();
  const [mode, setMode] = useState<Mode>('line');
  const [index, setIndex] = useState(Math.max(series.length - 1, 0));
  const [width, setWidth] = useState(0);
  // The Bulgarian axis labels ("200 хил.") are wider than the English ones ("200k").
  const M = { ...MARGIN, left: lang === 'bg' && digits === 0 ? 62 : 46 };

  const geo = useMemo(() => {
    if (width <= 0 || series.length === 0) return null;
    const values = series.map((p) => p.value);
    const ticks = niceTicks(mode === 'bar' ? 0 : Math.min(...values), Math.max(...values), 5);
    const yMin = ticks[0] ?? 0;
    const yMax = ticks[ticks.length - 1] ?? 1;
    const innerW = width - M.left - M.right;
    const innerH = H - M.top - M.bottom;
    const y = (v: number) => M.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
    const band = innerW / series.length;
    const xs = series.map((_, i) =>
      mode === 'bar' ? M.left + band * i + band / 2 : M.left + (series.length === 1 ? innerW / 2 : (innerW * i) / (series.length - 1)),
    );
    const pts = series.map((p, i) => ({ x: xs[i]!, y: y(p.value) }));
    return { ticks, y, xs, pts, band, baseY: y(yMin), stride: labelStride(series.length, innerW, 44) };
  }, [series, width, mode, M.left]);

  const current = series[index] ?? series[series.length - 1];
  const fmt = (n: number) => (digits === 0 ? fmtInt(lang, n) : fmtNum(lang, n, digits));
  const readout = current ? labels.readout.replace('{year}', String(current.year)).replace('{value}', fmt(current.value)) : '';

  function select(i: number) {
    if (i === index) return;
    setIndex(i);
    void Haptics.selectionAsync();
  }

  function touch(x: number) {
    if (geo) select(nearestIndex(geo.xs, x));
  }

  function step(delta: number) {
    setIndex((i) => Math.min(Math.max(i + delta, 0), series.length - 1));
  }

  return (
    <View style={{ gap: 12 }}>
      <Segmented
        label={labels.type}
        value={mode}
        onChange={setMode}
        options={[
          { key: 'line', label: labels.line },
          { key: 'area', label: labels.area },
          { key: 'bar', label: labels.bar },
        ]}
      />
      <View style={{ gap: 2 }}>
        <Text style={[styles.readout, { color: c.fg }]}>{current ? fmt(current.value) : ''}</Text>
        <Text style={[styles.hint, { color: c.muted }]}>{current ? `${current.year} · ${labels.hint}` : labels.hint}</Text>
      </View>
      <View
        style={{ height: H }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => touch(e.nativeEvent.locationX)}
        onResponderMove={(e) => touch(e.nativeEvent.locationX)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={labels.alt}
        accessibilityValue={{ min: 0, max: Math.max(series.length - 1, 0), now: index, text: readout }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      >
        {geo && (
          <Svg width={width} height={H} pointerEvents="none">
            <Defs>
              <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.accent} stopOpacity={0.3} />
                <Stop offset="1" stopColor={c.accent} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>
            {geo.ticks.map((tick) => (
              <G key={tick}>
                <Line x1={M.left} x2={width - M.right} y1={geo.y(tick)} y2={geo.y(tick)} stroke={c.grid} strokeWidth={1} />
                <SvgText x={M.left - 8} y={geo.y(tick) + 4} fontSize={11} fill={c.muted} textAnchor="end">
                  {axisLabel(lang, tick, digits)}
                </SvgText>
              </G>
            ))}
            {series.map((p, i) =>
              (i % geo.stride === 0 && series.length - 1 - i >= geo.stride) || i === series.length - 1 ? (
                <SvgText key={p.year} x={geo.xs[i]} y={H - 8} fontSize={11} fill={c.muted} textAnchor="middle">
                  {p.year}
                </SvgText>
              ) : null,
            )}
            {mode === 'bar' &&
              series.map((p, i) => {
                const w = Math.max(Math.min(geo.band * 0.62, 36), 4);
                return (
                  <Rect
                    key={p.year}
                    x={geo.xs[i]! - w / 2}
                    y={geo.y(p.value)}
                    width={w}
                    height={Math.max(geo.baseY - geo.y(p.value), 1)}
                    rx={4}
                    fill={c.accent}
                    opacity={i === index ? 1 : 0.5}
                  />
                );
              })}
            {mode === 'area' && geo.pts.length > 1 && (
              <Path
                d={`${linePath(geo.pts)} L${geo.pts[geo.pts.length - 1]!.x} ${geo.baseY} L${geo.pts[0]!.x} ${geo.baseY} Z`}
                fill="url(#trendFill)"
              />
            )}
            {mode !== 'bar' && (
              <Path d={linePath(geo.pts)} stroke={c.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            )}
            {mode !== 'bar' &&
              geo.pts.map((p, i) => (
                <Circle
                  key={series[i]!.year}
                  cx={p.x}
                  cy={p.y}
                  r={i === index ? 6 : 3.5}
                  fill={i === index ? c.accent : c.card}
                  stroke={i === index ? c.card : c.accent}
                  strokeWidth={i === index ? 3 : 2}
                />
              ))}
          </Svg>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  hint: { fontSize: 12.5 },
});
