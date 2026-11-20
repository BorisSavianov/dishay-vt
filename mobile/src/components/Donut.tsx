import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { useColors } from '../lib/color-mode';
import { donutSegments } from '../shared/chart';
import { fmtInt, fmtNum } from '../shared/format';
import type { Lang } from '../shared/types';
import type { PointType } from '../theme/palette';

export type DonutPart = { type: string; label: string; count: number; share: number };

const R = 70;
const C = 2 * Math.PI * R;

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
  const c = useColors();
  const colourOf = (type: string) => c.points[type as PointType] ?? c.muted;
  const segments = donutSegments(
    parts.map((p) => p.count),
    C,
    3,
  );
  return (
    <View style={styles.wrap}>
      <View accessible accessibilityRole="image" accessibilityLabel={alt} style={styles.chart}>
        <Svg width={170} height={170} viewBox="0 0 190 190">
          <G rotation={-90} origin="95, 95">
            <Circle cx={95} cy={95} r={R} stroke={c.grid} strokeWidth={22} fill="none" />
            {parts.map((p, i) => (
              <Circle
                key={p.type}
                cx={95}
                cy={95}
                r={R}
                stroke={colourOf(p.type)}
                strokeWidth={22}
                fill="none"
                strokeDasharray={`${segments[i]!.length} ${C}`}
                strokeDashoffset={segments[i]!.offset}
              />
            ))}
          </G>
          <SvgText x={95} y={103} fontSize={30} fontWeight="800" fill={c.fg} textAnchor="middle">
            {fmtInt(lang, total)}
          </SvgText>
          <SvgText x={95} y={122} fontSize={12} fill={c.muted} textAnchor="middle">
            {totalLabel}
          </SvgText>
        </Svg>
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.type} style={styles.row} accessible accessibilityLabel={`${p.label}: ${p.count}, ${fmtNum(lang, p.share, 1)}%`}>
            <View style={[styles.swatch, { backgroundColor: colourOf(p.type) }]} />
            <Text style={[styles.label, { color: c.fg }]}>{p.label}</Text>
            <Text style={[styles.count, { color: c.fg }]}>{fmtInt(lang, p.count)}</Text>
            <Text style={[styles.share, { color: c.muted }]}>{fmtNum(lang, p.share, 1)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, alignItems: 'center' },
  chart: { alignItems: 'center' },
  legend: { alignSelf: 'stretch', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  label: { flex: 1, fontSize: 15 },
  count: { fontSize: 15, fontWeight: '700' },
  share: { minWidth: 56, textAlign: 'right', fontSize: 14 },
});
