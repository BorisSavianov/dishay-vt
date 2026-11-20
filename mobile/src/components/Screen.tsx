import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorMode, useColors } from '../lib/color-mode';
import { useLang } from '../lib/lang';
import { ui } from '../lib/ui-strings';
import { fmtDate } from '../shared/format';
import { t } from '../shared/i18n';
import { BrandMark, Icon } from './Icon';

// The frame every tab shares: the brand bar with the language and theme switches, then the page title.
export function Screen({
  title,
  lead,
  updated,
  children,
}: {
  title: string;
  lead?: string;
  updated?: string | null;
  children: ReactNode;
}) {
  const c = useColors();
  const { lang, setLang } = useLang();
  const { mode, toggle } = useColorMode();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.bar}>
          <View style={styles.brand}>
            <BrandMark />
            <Text style={[styles.brandText, { color: c.fg }]}>{t(lang, 'brand.name')}</Text>
          </View>
          <View style={styles.controls}>
            <View style={[styles.seg, { backgroundColor: c.card2, borderColor: c.line }]} accessibilityRole="radiogroup">
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
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                toggle();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${ui(lang, 'mode.toggle')}: ${ui(lang, mode === 'dark' ? 'mode.light' : 'mode.dark')}`}
              style={[styles.iconButton, { backgroundColor: c.card, borderColor: c.line }]}
            >
              <Icon name={mode === 'dark' ? 'sun' : 'moon'} color={c.fg} size={20} />
            </Pressable>
          </View>
        </View>

        <View style={styles.head}>
          <Text style={[styles.eyebrow, { color: c.muted }]}>{t(lang, 'brand.tagline').toUpperCase()}</Text>
          <Text style={[styles.title, { color: c.fg }]} accessibilityRole="header">
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontSize: 17, fontWeight: '700' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seg: { flexDirection: 'row', padding: 3, borderRadius: 12, borderWidth: 1 },
  segItem: { minWidth: 40, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  segText: { fontSize: 13, fontWeight: '700' },
  iconButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  head: { gap: 6 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.6 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
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
