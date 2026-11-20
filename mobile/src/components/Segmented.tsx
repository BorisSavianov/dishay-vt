import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../lib/color-mode';

// A small segmented control. Each option is a button; the chosen one is marked selected for screen readers.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  label: string;
}) {
  const c = useColors();
  return (
    <View style={[styles.row, { backgroundColor: c.card2, borderColor: c.line }]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.item, on && { backgroundColor: c.accent }]}
          >
            <Text style={[styles.text, { color: on ? c.onAccent : c.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignSelf: 'flex-start', padding: 3, borderRadius: 12, borderWidth: 1 },
  item: { minHeight: 36, minWidth: 54, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  text: { fontSize: 13, fontWeight: '700' },
});
