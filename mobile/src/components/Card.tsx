import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '../lib/color-mode';
import { Icon, type IconName } from './Icon';

export function Card({ children, soft = false, style }: { children: ReactNode; soft?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: soft ? c.accentSoft : c.card, borderColor: soft ? 'transparent' : c.line },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardTitle({ title, sub }: { title: string; sub?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[styles.title, { color: c.fg }]} accessibilityRole="header">
        {title}
      </Text>
      {sub ? <Text style={[styles.sub, { color: c.muted }]}>{sub}</Text> : null}
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[styles.note, { color: c.muted }]}>{children}</Text>;
}

// One headline number with its label and a line of context. `delta` adds the red or green change chip.
export function Kpi({
  icon,
  label,
  value,
  sub,
  delta,
  primary = false,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub: string;
  delta?: { text: string; negative: boolean };
  primary?: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={[styles.kpi, { backgroundColor: primary ? c.accentSoft : c.card, borderColor: primary ? 'transparent' : c.line }]}
      accessible
      accessibilityLabel={`${label}: ${value}. ${delta ? delta.text + '. ' : ''}${sub}`}
    >
      <View style={styles.kpiTop}>
        <Icon name={icon} color={c.accent} size={18} />
        <Text style={[styles.kpiLabel, { color: c.muted }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text style={[styles.kpiValue, { color: c.fg }]} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
      {delta ? (
        <View style={[styles.delta, { backgroundColor: delta.negative ? c.negSoft : c.posSoft }]}>
          <Text style={[styles.deltaText, { color: delta.negative ? c.neg : c.pos }]}>
            {delta.negative ? '▼' : '▲'} {delta.text}
          </Text>
        </View>
      ) : null}
      <Text style={[styles.kpiSub, { color: c.muted }]}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 18, borderRadius: 22, borderWidth: 1 },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  sub: { fontSize: 13 },
  note: { fontSize: 12.5, lineHeight: 18 },
  kpi: { flexGrow: 1, flexBasis: '45%', gap: 4, padding: 16, borderRadius: 22, borderWidth: 1 },
  kpiTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  kpiLabel: { flex: 1, fontSize: 13, fontWeight: '500' },
  kpiValue: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8, marginTop: 4 },
  delta: { alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10 },
  deltaText: { fontSize: 13, fontWeight: '700' },
  kpiSub: { fontSize: 12.5, lineHeight: 17 },
});
