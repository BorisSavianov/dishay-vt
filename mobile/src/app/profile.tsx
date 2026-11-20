import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { levelNow, PROFILES, LEVEL_COLORS, type Profile } from '../aq/levels';
import { useAir } from '../aq/store';
import { air, profileName } from '../aq/strings';
import { Card, CardTitle, Columns, Note } from '../components/Card';
import { Screen } from '../components/Screen';
import { useColors } from '../lib/color-mode';
import { useLang } from '../lib/lang';
import { useLayout } from '../lib/layout';

const PROFILE_ICONS: Record<Profile, string> = { asthma: '🫁', child: '🧒', elderly: '🧓', runner: '🏃', general: '🙂' };

// Onboarding and settings: who the warnings are for, which station is home, and the notification switch.
export default function ProfileScreen() {
  const { lang } = useLang();
  const c = useColors();
  const { columns } = useLayout();
  const { prefs, setPrefs, forecast, home, alerts, enableAlerts } = useAir();
  const [profile, setProfile] = useState<Profile>(prefs.profile);
  const [stationId, setStationId] = useState<string | null>(prefs.stationId ?? home?.id ?? null);

  useEffect(() => {
    if (!stationId && home) setStationId(home.id);
  }, [home, stationId]);

  // VT stations first, then the rest by city.
  const stations = [...(forecast?.stations ?? [])].sort(
    (a, b) =>
      Number(b.city === 'Велико Търново') - Number(a.city === 'Велико Търново') ||
      Number(!!b.featured) - Number(!!a.featured) ||
      a.city.localeCompare(b.city, 'bg') ||
      a.name.localeCompare(b.name, 'bg'),
  );

  async function save() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPrefs({ profile, stationId, onboarded: true });
    if (!alerts.allowed) await enableAlerts();
    router.navigate('/');
  }

  const stationCard = (
    <Card>
      <CardTitle title={air(lang, 'air.station')} />
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {stations.map((s) => {
          const on = s.id === stationId;
          const now = levelNow(s, new Date());
          return (
            <Pressable
              key={s.id}
              onPress={() => setStationId(s.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.row, { backgroundColor: on ? c.accentSoft : 'transparent', borderColor: on ? c.accent : c.line }]}
            >
              <View style={[styles.dot, { backgroundColor: now ? LEVEL_COLORS[now.level] : c.line }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: c.fg }]}>{s.name}</Text>
                <Text style={[styles.rowSub, { color: c.muted }]}>{s.city}</Text>
              </View>
              {on ? <Text style={{ color: c.accent, fontWeight: '800' }}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );

  return (
    <Screen tab="profile" title={air(lang, 'air.profile.title')} lead={air(lang, 'air.profile.lead')}>
      <Columns
        columns={columns}
        left={
          <>
            <Card>
              <View style={styles.grid} accessibilityRole="radiogroup">
                {PROFILES.map((p) => {
                  const on = p === profile;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setProfile(p);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={[
                        styles.chip,
                        { backgroundColor: on ? c.accentSoft : 'transparent', borderColor: on ? c.accent : c.line },
                      ]}
                    >
                      <Text style={styles.emoji}>{PROFILE_ICONS[p]}</Text>
                      <Text style={[styles.chipText, { color: c.fg }]}>{profileName(lang, p)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
            <Pressable
              onPress={save}
              accessibilityRole="button"
              style={({ pressed }) => [styles.save, { backgroundColor: c.accent, shadowColor: c.accent }, pressed && { opacity: 0.8 }]}
            >
              <Text style={[styles.saveText, { color: c.onAccent }]}>{air(lang, 'air.profile.save')}</Text>
            </Pressable>
          </>
        }
        right={stationCard}
      />

      <Note>{air(lang, 'air.source')}</Note>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexBasis: '47%', flexGrow: 1, minHeight: 64, borderRadius: 16, borderWidth: 1.5, padding: 12, gap: 4, justifyContent: 'center' },
  emoji: { fontSize: 22 },
  chipText: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12.5 },
  // The accent button glows softly, as the web's current nav pill.
  save: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  saveText: { fontSize: 17, fontWeight: '800' },
});
