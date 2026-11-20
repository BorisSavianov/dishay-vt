import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../lib/color-mode';
import { fmtInt } from '../shared/format';
import type { Lang } from '../shared/types';
import type { PointType } from '../theme/palette';

export type MapType = { type: string; label: string; count: number };

// The type chips under a map. Tapping one hides or shows that type. Shared by the real map and the dot map.
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
  const c = useColors();
  return (
    <>
      <Text style={[styles.heading, { color: c.muted }]}>{typeHeading}</Text>
      <View style={styles.legend}>
        {types.map((ty) => {
          const on = !hidden.has(ty.type);
          return (
            <Pressable
              key={ty.type}
              onPress={() => onToggle(ty.type)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, { borderColor: c.line, opacity: on ? 1 : 0.45 }]}
            >
              <View style={[styles.swatch, { backgroundColor: c.points[ty.type as PointType] ?? c.muted }]} />
              <Text style={[styles.chipText, { color: c.fg }]}>{ty.label}</Text>
              <Text style={[styles.chipCount, { color: c.fg }]}>{fmtInt(lang, ty.count)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.note, { color: c.muted }]} accessibilityLiveRegion="polite">
        {shownLabel.replace('{count}', fmtInt(lang, shown)).replace('{total}', fmtInt(lang, total))}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 13, fontWeight: '600' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  chipText: { fontSize: 14 },
  chipCount: { fontSize: 14, fontWeight: '700' },
  note: { fontSize: 12.5 },
});
