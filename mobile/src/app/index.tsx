import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { testAlert } from '../aq/alerts';
import { bestWindow, clampLevel, LEVEL_COLORS, levelNow, levelTextColor, localDate, type Level } from '../aq/levels';
import { freshness, isCleanDay, showSources, sourcesLine } from '../aq/sources';
import { useAir } from '../aq/store';
import { advice, air, levelName, profileName } from '../aq/strings';
import { Card, CardTitle, Columns, Note } from '../components/Card';
import { ExplainCard } from '../components/ExplainCard';
import { ForecastChart } from '../components/ForecastChart';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { useColors } from '../lib/color-mode';
import { useLang } from '../lib/lang';
import { useLayout } from '../lib/layout';
import type { Lang } from '../shared/types';

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayLabel(lang: Lang, date: string, now: Date): string {
  if (date === localDate(now)) return air(lang, 'day.today');
  if (date === localDate(new Date(now.getTime() + 86400_000))) return air(lang, 'day.tomorrow');
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-GB', { weekday: 'long' });
}

// When the forecast was made; amber once it is more than 2 hours old (the hourly loop has stopped).
function FreshLine({ generatedAt, now, lang }: { generatedAt: string; now: Date; lang: Lang }) {
  const c = useColors();
  const f = freshness(generatedAt, now);
  if (f.stale) return <Text style={[styles.live, { color: c.warn }]}>{air(lang, 'air.stale', { time: f.time })}</Text>;
  return <Text style={[styles.live, { color: c.muted }]}>{air(lang, f.today ? 'air.live.today' : 'air.live', { time: f.time })}</Text>;
}

// The home tab: the home station's air now, the 72-hour forecast, the next days with reasons,
// the cleanest window today and the alert switch.
export default function AirScreen() {
  const { lang } = useLang();
  const c = useColors();
  const { forecast, source, loading, home, prefs, refresh, alerts, enableAlerts } = useAir();
  const now = new Date();
  const { columns } = useLayout();

  // First launch: pick a profile and station.
  useEffect(() => {
    if (forecast && !prefs.onboarded) router.navigate('/profile');
  }, [forecast, prefs.onboarded]);

  const current = home ? levelNow(home, now) : null;
  const best = useMemo(() => (home?.hourly ? bestWindow(home.hourly, new Date()) : null), [home]);

  if (!forecast || !home) {
    return (
      <Screen title={air(lang, 'air.title')} lead={air(lang, 'air.lead')}>
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  const level: Level | null = current?.level ?? null;

  return (
    <Screen title={air(lang, 'air.title')} lead={air(lang, 'air.lead')} accent={level ? LEVEL_COLORS[level] : undefined}>
      {source === 'demo' ? (
        <Pressable
          onPress={refresh}
          accessibilityRole="button"
          style={[styles.banner, { backgroundColor: c.negSoft, borderColor: c.line }]}
        >
          <Text style={[styles.bannerText, { color: c.warn }]}>{air(lang, 'air.demo')}</Text>
          {loading ? <ActivityIndicator color={c.warn} /> : <Icon name="refresh" color={c.warn} size={18} />}
        </Pressable>
      ) : (
        <FreshLine generatedAt={forecast.generated_at} now={now} lang={lang} />
      )}

      <Columns
        columns={columns}
        left={
          <>
            {/* The headline card: level colour, number, advice for this profile. */}
            <View
              style={[styles.hero, { backgroundColor: level ? LEVEL_COLORS[level] : c.card2 }]}
              accessible
              accessibilityLabel={
                level && current
                  ? `${home.name}: ${levelName(lang, level)}, PM2.5 ${Math.round(current.pm25)}. ${advice(lang, prefs.profile, level)}`
                  : home.name
              }
            >
              <Pressable onPress={() => router.navigate('/profile')} style={styles.heroTop} accessibilityRole="button">
                <Text style={[styles.heroPlace, { color: level ? levelTextColor(level) : c.fg }]} numberOfLines={1}>
                  {home.name}
                </Text>
                <Text style={[styles.heroChange, { color: level ? levelTextColor(level) : c.fg }]}>
                  {profileName(lang, prefs.profile)} · {air(lang, 'air.change')}
                </Text>
              </Pressable>
              {level && current ? (
                <>
                  <Text style={[styles.heroLevel, { color: levelTextColor(level) }]}>{levelName(lang, level)}</Text>
                  <View style={styles.heroNums}>
                    <Text style={[styles.heroNum, { color: levelTextColor(level) }]}>{Math.round(current.pm25)}</Text>
                    <Text style={[styles.heroUnit, { color: levelTextColor(level) }]}>
                      µg/m³ PM2.5{'\n'}
                      {air(lang, current.measured ? 'air.now.measured' : 'air.now.forecast')}
                    </Text>
                  </View>
                  <Text style={[styles.heroAdvice, { color: levelTextColor(level) }]}>{advice(lang, prefs.profile, level)}</Text>
          </>
        ) : null}
      </View>

      <Card>
        <CardTitle title={air(lang, 'air.best.title')} />
        <Text style={[styles.best, { color: c.fg }]}>
          {best
            ? air(lang, 'air.best.body', { start: hhmm(best.start), end: hhmm(best.end), pm: Math.round(best.pm25) })
            : air(lang, 'air.best.none')}
        </Text>
      </Card>

      <Card>
        <CardTitle title={air(lang, 'air.alerts.title')} />
        <Text style={[styles.best, { color: c.fg }]}>
          {alerts.allowed
            ? alerts.scheduled
              ? air(lang, 'air.alerts.on', { count: alerts.scheduled })
              : air(lang, 'air.alerts.none')
            : air(lang, 'air.alerts.off')}
        </Text>
        {!alerts.allowed ? (
          <Pressable onPress={enableAlerts} accessibilityRole="button" style={[styles.button, { backgroundColor: c.accent }]}>
            <Text style={[styles.buttonText, { color: c.onAccent }]}>{air(lang, 'air.alerts.enable')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            void testAlert(lang, home, prefs.profile);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, styles.ghost, { borderColor: c.line, backgroundColor: c.card }, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.buttonText, { color: c.fg }]}>{air(lang, 'air.alerts.test')}</Text>
        </Pressable>
        <Pressable onPress={() => router.navigate('/profile')} accessibilityRole="button" style={styles.link}>
          <Text style={[styles.linkText, { color: c.accent }]}>{air(lang, 'air.profile.edit')} →</Text>
        </Pressable>
      </Card>

          </>
        }
        right={
          <>
            {home.hourly?.length ? (
              <Card>
                <CardTitle title={air(lang, 'air.chart.title')} sub={air(lang, 'air.chart.sub')} />
                <ForecastChart
                  hourly={home.hourly}
                  lang={lang}
                  labels={{ ours: air(lang, 'air.chart.ours'), cams: air(lang, 'air.chart.cams') }}
                />
              </Card>
            ) : null}

            <Card>
              <CardTitle title={air(lang, 'air.days.title')} />
              <View style={{ gap: 10 }}>
                {home.daily.map((d, i) => {
                  const lv = clampLevel(d.level);
                  return (
                    <View key={d.date} style={[styles.day, { borderColor: c.line, backgroundColor: c.card2 }]}>
                      <View style={styles.dayHead}>
                        <View style={[styles.dayBadge, { backgroundColor: LEVEL_COLORS[lv] }]}>
                          <Text style={[styles.dayBadgeText, { color: levelTextColor(lv) }]}>{levelName(lang, lv)}</Text>
                        </View>
                        <Text style={[styles.dayName, { color: c.fg }]}>{dayLabel(lang, d.date, now)}</Text>
                        <Text style={[styles.dayPm, { color: c.muted }]}>PM10 {Math.round(d.pm10_mean)}</Text>
                      </View>
                      {d.exceeds_eu_limit ? <Text style={[styles.eu, { color: c.neg }]}>⚠ {air(lang, 'air.eu')}</Text> : null}
                      {isCleanDay(d) ? <Text style={[styles.clean, { color: c.fg }]}>{air(lang, 'air.days.clean')}</Text> : null}
                      {d.reasons.length ? (
                        <Text style={[styles.why, { color: c.muted }]}>
                          {air(lang, 'air.days.why')}:{' '}
                          {d.reasons
                            .slice(0, 3)
                            .map((r) => (lang === 'en' && r.label_en ? r.label_en : r.label_bg))
                            .join(' · ')}
                        </Text>
                      ) : null}
                      {i === 0 && showSources(d) ? (
                        <Text style={[styles.why, { color: c.muted }]}>{sourcesLine(d.sources, lang)}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </Card>

            {/* The server explains its own forecast, so the card would contradict the demo numbers. */}
            {source === 'live' ? <ExplainCard station={home.id} profile={prefs.profile} lang={lang} /> : null}
          </>
        }
      />

      <Note>{air(lang, 'air.source')}</Note>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  live: { fontSize: 13, fontWeight: '600' },
  hero: { borderRadius: 26, padding: 20, gap: 6 },
  heroTop: { gap: 2 },
  heroPlace: { fontSize: 16, fontWeight: '700' },
  heroChange: { fontSize: 12.5, fontWeight: '600', opacity: 0.85 },
  heroLevel: { fontSize: 30, fontWeight: '800', marginTop: 8, letterSpacing: -0.6 },
  heroNums: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  heroNum: { fontSize: 64, fontWeight: '800', letterSpacing: -2, lineHeight: 68 },
  heroUnit: { fontSize: 13, fontWeight: '600', marginBottom: 10, opacity: 0.9 },
  heroAdvice: { fontSize: 16, fontWeight: '600', lineHeight: 22, marginTop: 4 },
  best: { fontSize: 16, lineHeight: 22 },
  day: { gap: 6, padding: 12, borderRadius: 16, borderWidth: 1 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayBadge: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  dayBadgeText: { fontSize: 12.5, fontWeight: '800' },
  dayName: { flex: 1, fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  dayPm: { fontSize: 13, fontWeight: '600' },
  eu: { fontSize: 13, fontWeight: '700' },
  why: { fontSize: 13, lineHeight: 18 },
  clean: { fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
  button: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ghost: { borderWidth: 1 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  link: { minHeight: 36, justifyContent: 'center' },
  linkText: { fontSize: 15, fontWeight: '700' },
});
