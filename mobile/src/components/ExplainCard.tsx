import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchExplain, type Explanation } from '../aq/api';
import type { Profile } from '../aq/levels';
import { air, profileName } from '../aq/strings';
import { useColors } from '../lib/color-mode';
import type { Lang } from '../shared/types';
import { Card, CardTitle } from './Card';

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | ({ status: 'done' } & Explanation);

// „Какво означава това за мен?“: asks the web app to explain the home station's forecast for the chosen group.
export function ExplainCard({ station, profile, lang }: { station: string; profile: Profile; lang: Lang }) {
  const c = useColors();
  const [state, setState] = useState<State>({ status: 'idle' });

  // A new station, group or language makes the old answer wrong.
  useEffect(() => setState({ status: 'idle' }), [station, profile, lang]);

  async function run() {
    void Haptics.selectionAsync();
    setState({ status: 'loading' });
    try {
      setState({ status: 'done', ...(await fetchExplain(station, profile, lang)) });
    } catch {
      setState({ status: 'error' });
    }
  }

  const loading = state.status === 'loading';
  return (
    <Card>
      <CardTitle title={air(lang, 'ex.title')} sub={air(lang, 'ex.sub')} />
      <Pressable
        onPress={run}
        disabled={loading}
        accessibilityRole="button"
        accessibilityState={{ busy: loading }}
        style={({ pressed }) => [styles.button, { backgroundColor: c.accent }, (pressed || loading) && { opacity: 0.75 }]}
      >
        {loading ? <ActivityIndicator color={c.onAccent} /> : null}
        <Text style={[styles.buttonText, { color: c.onAccent }]}>
          {loading ? air(lang, 'ex.loading') : air(lang, 'ex.button', { profile: profileName(lang, profile) })}
        </Text>
      </Pressable>
      <View accessibilityLiveRegion="polite">
        {state.status === 'error' ? <Text style={[styles.text, { color: c.neg }]}>{air(lang, 'ex.error')}</Text> : null}
        {state.status === 'done' ? (
          <View style={styles.answer}>
            <Text style={[styles.text, { color: c.fg }]} selectable>
              {state.text}
            </Text>
            <Text style={[styles.badge, { color: c.muted, borderColor: c.line }]}>
              {air(lang, `ex.provider.${state.provider}`)}
              {state.cached ? `, ${air(lang, 'ex.cached')}` : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 14 },
  buttonText: { fontSize: 15, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  answer: { gap: 10, marginTop: 4 },
  text: { fontSize: 16, lineHeight: 24 },
  badge: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '600', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
});
