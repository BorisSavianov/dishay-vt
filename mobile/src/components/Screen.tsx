import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { air } from '../aq/strings';
import { useColorMode, useColors } from '../lib/color-mode';
import { useLang } from '../lib/lang';
import { CONTENT_MAX, useLayout } from '../lib/layout';
import { ui } from '../lib/ui-strings';
import { fmtDate } from '../shared/format';
import { t } from '../shared/i18n';
import { backdropPoster, type TabId } from '../theme/look';
import { Backdrop } from './Backdrop';
import { Glass } from './Glass';
import { GradientTitle } from './GradientTitle';
import { BrandMark, Icon } from './Icon';
import { RevealProvider, useRevealScroll } from './Reveal';

// The frame every tab shares: the brand bar with the language and theme switches, then the page title.
// Safe areas apply on every side, since the iPhone Duo's camera cuts into one corner, not the top centre.
// `tab` picks the story still behind the page; `smog` (0..1) hazes it, for the air tab's current level.
export function Screen({
  title,
  lead,
  updated,
  tab,
  smog = 0,
  children,
}: {
  title: string;
  lead?: string;
  updated?: string | null;
  tab: TabId;
  smog?: number;
  children: ReactNode;
}) {
  const c = useColors();
  const { lang, setLang } = useLang();
  const { mode, toggle } = useColorMode();
  const { gutter, compact, height } = useLayout();
  const reveal = useRevealScroll(height);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <Backdrop poster={backdropPoster(tab, mode)} smog={smog} />
      <RevealProvider state={reveal.state}>
        <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
          <ScrollView
            onScroll={reveal.onScroll}
            scrollEventThrottle={32}
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
                <Glass fallback={c.glass} style={[styles.seg, { borderColor: c.line }]}>
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
                          style={[styles.segItem, on && [styles.segOn, { backgroundColor: c.accent, shadowColor: c.accent }]]}
                        >
                          <Text style={[styles.segText, { color: on ? c.onAccent : c.muted }]}>{code.toUpperCase()}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Glass>
                <Glass fallback={c.glass} interactive style={[styles.iconButton, { borderColor: c.line }]}>
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
              <GradientTitle style={[styles.title, compact && styles.titleCompact]}>{title}</GradientTitle>
              {lead ? <Text style={[styles.lead, { color: c.muted }]}>{lead}</Text> : null}
              {updated ? (
                <View style={[styles.pill, { backgroundColor: c.glass, borderColor: c.line }]}>
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
      </RevealProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, left: 0 },
  content: { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', paddingBottom: 32 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  brandText: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seg: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  segRow: { flexDirection: 'row', padding: 3 },
  segItem: { minWidth: 40, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  // The active pill glows softly, like the web sidebar's current page.
  segOn: { shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  segText: { fontSize: 13, fontWeight: '700' },
  iconButton: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  iconHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { gap: 6 },
  // The story's small uppercase tracking and its tight, heavy headline (web .eyebrow, .page-title).
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 2.2 },
  title: { fontSize: 36, lineHeight: 40, fontWeight: '800', letterSpacing: -1.2, marginTop: 2 },
  titleCompact: { fontSize: 29, lineHeight: 33, letterSpacing: -0.9 },
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
