import { StyleSheet, Text, View } from 'react-native';
import { clampLevel, LEVEL_COLORS, levelTextColor, type Level } from '../aq/levels';
import { levelName } from '../aq/strings';
import type { Lang } from '../shared/types';

// A level in its EAQI colour with its number and name, so colour is never the only signal (web components/aq/Level.tsx).
export function LevelChip({ level, lang, big = false }: { level: number; lang: Lang; big?: boolean }) {
  const l: Level = clampLevel(level);
  const fg = levelTextColor(l);
  return (
    <View style={[styles.chip, big && styles.chipBig, { backgroundColor: LEVEL_COLORS[l] }]}>
      <View style={[styles.num, big && styles.numBig]}>
        <Text style={[styles.numText, big && styles.numTextBig, { color: fg }]} importantForAccessibility="no">
          {l}
        </Text>
      </View>
      <Text style={[styles.name, big && styles.nameBig, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>
        {levelName(lang, l)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 12,
    borderRadius: 999,
  },
  chipBig: { gap: 12, paddingVertical: 8, paddingLeft: 8, paddingRight: 20, maxWidth: '100%' },
  num: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  numBig: { width: 42, height: 42, borderRadius: 21 },
  numText: { fontSize: 12.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  numTextBig: { fontSize: 20 },
  name: { fontSize: 13, fontWeight: '800' },
  nameBig: { fontSize: 28, letterSpacing: -0.6, flexShrink: 1 },
});
