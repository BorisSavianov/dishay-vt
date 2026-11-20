import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchSummary, type SummaryResult } from '../lib/api';
import { useColors } from '../lib/color-mode';
import { t } from '../shared/i18n';
import type { DatasetName, Lang } from '../shared/types';
import { Card, CardTitle, Note } from './Card';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: SummaryResult }
  | { status: 'error' };

// Asks the hosted API for a plain-language summary. The figures themselves always come from the bundled data.
export function SummaryCard({ dataset, lang, title, source }: { dataset: DatasetName; lang: Lang; title: string; source: string }) {
  const c = useColors();
  const [state, setState] = useState<State>({ status: 'idle' });

  async function run() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setState({ status: 'loading' });
    try {
      setState({ status: 'done', result: await fetchSummary(dataset, lang) });
    } catch {
      setState({ status: 'error' });
    }
  }

  return (
    <Card>
      <CardTitle title={title} />
      <Note>{source}</Note>
      <Pressable
        onPress={run}
        disabled={state.status === 'loading'}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, { backgroundColor: c.accent }, (pressed || state.status === 'loading') && styles.pressed]}
      >
        <Text style={[styles.buttonText, { color: c.onAccent }]}>{t(lang, 'summary.button')}</Text>
      </Pressable>
      {state.status === 'loading' && (
        <View style={styles.row}>
          <ActivityIndicator color={c.muted} />
          <Text style={{ color: c.muted }}>{t(lang, 'summary.loading')}</Text>
        </View>
      )}
      {state.status === 'error' && <Text style={{ color: c.neg, fontSize: 14 }}>{t(lang, 'summary.error')}</Text>}
      {state.status === 'done' && (
        <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
          <Text style={[styles.body, { color: c.fg }]}>{state.result.text}</Text>
          <View style={[styles.badge, { backgroundColor: c.accentSoft }]}>
            <Text style={[styles.badgeText, { color: c.accentStrong }]}>
              {t(lang, `summary.provider.${state.result.provider}` as 'summary.provider.groq')}
              {state.result.cached ? `, ${t(lang, 'summary.cached')}` : ''}
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14 },
  pressed: { opacity: 0.75 },
  buttonText: { fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { fontSize: 16, lineHeight: 24 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  badgeText: { fontSize: 12.5, fontWeight: '600' },
});
