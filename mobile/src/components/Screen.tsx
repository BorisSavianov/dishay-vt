import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { air } from '../aq/strings';
import { useColorMode, useColors } from '../lib/color-mode';
import { useLang } from '../lib/lang';
import { CONTENT_MAX, useLayout } from '../lib/layout';
import { ui } from '../lib/ui-strings';
import { fmtDate } from '../shared/format';
import { t } from '../shared/i18n';
import { Glass } from './Glass';
import { BrandMark, Icon } from './Icon';

// Soft colour fields behind the content, so the glass cards have something to refract.
function Backdrop({ accent }: { accent?: string }) {
  const { mode, colors: c } = useColorMode();
  const a = accent ?? c.accent;
  const o = mode === 'dark' ? 0.35 : 0.22;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="g1" cx="12%" cy="8%" r="60%">
          <Stop offset="0" stopColor={a} stopOpacity={o} />
          <Stop offset="1" stopColor={a} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="g2" cx="95%" cy="45%" r="55%">
          <Stop offset="0" stopColor={c.points.pharmacy} stopOpacity={o * 0.7} />
          <Stop offset="1" stopColor={c.points.pharmacy} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#g1)" />
      <Rect width="100%" height="100%" fill="url(#g2)" />
    </Svg>
  );
}

// The frame every tab shares: the brand bar with the language and theme switches, then the page title.
// Safe areas apply on every side, since the iPhone Duo's camera cuts into one corner, not the top centre.
export function Screen({
  title,
  lead,
  updated,
  accent,
  children,
}: {
  title: string;
  lead?: string;
  updated?: string | null;
  accent?: string;
  children: ReactNode;
}) {
  const c = useColors();
  const { lang, setLang } = useLang();
  const { mode, toggle } = useColorMode();
  const { gutter, compact } = useLayout();

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <Backdrop accent={accent} />
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[styles.content, { padding: gutter, gap: gutter }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.bar}>
            <View style={styles.brand}>
              <BrandMark size={compact ? 24 : 28} />
              <Text style={[styles.brandText, { color: c.fg }]} numberOfLines={1}>
                {air(lang, 'brand.name')}
              </Text>
            </View>
            <View style={styles.controls}>
              <Glass fallback={c.card2} style={[styles.seg, { borderColor: c.line }]}>
                <View style={styles.segRow} accessibilityRole="radiogroup">
                  {(['bg', 'en'] as const).map((code) => {
                    const on = lang === code;
                    return (
                      <Pressable
                        key={code}
                        onPress={() => setLang(code)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={t(lang, code === 'bg' ? 'lang.bg' : 'lang.en')}
                        style={[styles.segItem, on && { backgroundColor: c.accent }]}
                      >
                        <Text style={[styles.segText, { color: on ? c.onAccent : c.muted }]}>{code.toUpperCase()}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Glass>
              <Glass fallback={c.card} interactive style={[styles.iconButton, { borderColor: c.line }]}>
                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    toggle();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${ui(lang, 'mode.toggle')}: ${ui(lang, mode === 'dark' ? 'mode.light' : 'mode.dark')}`}
                  style={styles.iconHit}
                >
                  <Icon name={mode === 'dark' ? 'sun' : 'moon'} color={c.fg} size={20} />
                </Pressable>
              </Glass>
            </View>
          </View>

          <View style={styles.head}>
            <Text style={[styles.eyebrow, { color: c.muted }]}>{air(lang, 'brand.tagline').toUpperCase()}</Text>
            <Text style={[styles.title, { color: c.fg }, compact && styles.titleCompact]} accessibilityRole="header">
              {title}
            </Text>
            {lead ? <Text style={[styles.lead, { color: c.muted }]}>{lead}</Text> : null}
            {updated ? (
              <View style={[styles.pill, { backgroundColor: c.card2, borderColor: c.line }]}>
                <Icon name="refresh" color={c.muted} size={16} />
                <Text style={[styles.pillText, { color: c.muted }]}>
                  {t(lang, 'updated.label', { date: fmtDate(lang, updated) })}
                </Text>
              </View>
            ) : null}
          </View>

          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', paddingBottom: 32 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  brandText: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seg: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  segRow: { flexDirection: 'row', padding: 3 },
  segItem: { minWidth: 40, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  segText: { fontSize: 13, fontWeight: '700' },
  iconButton: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  iconHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { gap: 6 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.6 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  titleCompact: { fontSize: 28 },
  lead: { fontSize: 15, lineHeight: 22 },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  pillText: { fontSize: 13 },
});
