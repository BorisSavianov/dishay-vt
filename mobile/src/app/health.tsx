import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { clampLevel, levelNow, localDate, type Level } from '../aq/levels';
import { useAir } from '../aq/store';
import { advice, air, profileName } from '../aq/strings';
import { Card, CardTitle, Columns, Note } from '../components/Card';
import { Icon } from '../components/Icon';
import { LevelChip } from '../components/LevelChip';
import { Screen } from '../components/Screen';
import { SourceLine } from '../components/SourceLine';
import { useColors } from '../lib/color-mode';
import { bundled } from '../lib/data';
import { useLang } from '../lib/lang';
import { useLayout } from '../lib/layout';
import { t } from '../shared/i18n';
import type { Point } from '../shared/types';

// Great-circle distance in km.
function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLon = r(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function openInMaps(p: Point) {
  const q = encodeURIComponent(p.name ?? `${p.lat},${p.lon}`);
  void Linking.openURL(`https://maps.apple.com/?ll=${p.lat},${p.lon}&q=${q}`);
}

// Health help built on the forecast: what this profile should do today and tomorrow, when to see a doctor,
// and the nearest pharmacies and hospitals to the home station (OpenStreetMap).
export default function Health() {
  const { lang } = useLang();
  const c = useColors();
  const { columns } = useLayout();
  const { home, prefs } = useAir();
  const now = new Date();

  const nearest = useMemo(() => {
    if (!home) return { pharmacy: [], hospital: [] };
    const withDist = bundled.facilities.points
      .filter((p) => p.type !== 'bus_stop')
      .map((p) => ({ p, d: km(home.lat, home.lon, p.lat, p.lon) }))
      .sort((a, b) => a.d - b.d);
    return {
      pharmacy: withDist.filter((x) => x.p.type === 'pharmacy').slice(0, 3),
      hospital: withDist.filter((x) => x.p.type !== 'pharmacy').slice(0, 3),
    };
  }, [home]);

  const today = localDate(now);
  const tomorrow = localDate(new Date(now.getTime() + 86400_000));
  const days: { label: string; level: Level | null }[] = [
    { label: air(lang, 'day.today'), level: home ? (levelNow(home, now)?.level ?? null) : null },
    {
      label: air(lang, 'day.tomorrow'),
      level: (() => {
        const d = home?.daily.find((x) => x.date === tomorrow) ?? home?.daily.find((x) => x.date > today);
        return d ? clampLevel(d.level) : null;
      })(),
    },
  ];

  const plan = (
    <Card>
      <CardTitle title={air(lang, 'health.plan.title')} sub={profileName(lang, prefs.profile)} />
      {days.map(({ label, level }) =>
        level ? (
          <View key={label} style={[styles.planRow, { borderColor: c.line }]}>
            <View style={styles.planHead}>
              <Text style={[styles.planDay, { color: c.fg }]}>{label}</Text>
              <LevelChip level={level} lang={lang} />
            </View>
            <Text style={[styles.planText, { color: c.fg }]}>{advice(lang, prefs.profile, level)}</Text>
          </View>
        ) : null,
      )}
    </Card>
  );

  const doctor = (
    <Card soft>
      <CardTitle title={air(lang, 'health.symptoms.title')} />
      <Text style={[styles.planText, { color: c.fg }]}>{air(lang, 'health.symptoms.body')}</Text>
    </Card>
  );

  const list = (title: string, items: { p: Point; d: number }[]) => (
    <View style={{ gap: 8 }}>
      <Text style={[styles.listTitle, { color: c.muted }]}>{title.toUpperCase()}</Text>
      {items.length === 0 ? <Note>{air(lang, 'health.near.none')}</Note> : null}
      {items.map(({ p, d }, i) => (
        <Pressable
          key={`${p.lat},${p.lon},${i}`}
          onPress={() => openInMaps(p)}
          accessibilityRole="link"
          accessibilityHint={air(lang, 'health.near.open')}
          style={({ pressed }) => [styles.place, { borderColor: c.line }, pressed && { opacity: 0.7 }]}
        >
          <View style={[styles.dot, { backgroundColor: c.points[p.type as keyof typeof c.points] ?? c.muted }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.placeName, { color: c.fg }]} numberOfLines={1}>
              {p.name ?? air(lang, p.type === 'pharmacy' ? 'health.unnamed.pharmacy' : 'health.unnamed.other')}
            </Text>
            {p.address || p.hours ? (
              <Text style={[styles.placeSub, { color: c.muted }]} numberOfLines={1}>
                {[p.address, p.hours].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.dist, { color: c.muted }]}>
            {d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`}
          </Text>
          <Icon name="arrow" color={c.muted} size={16} />
        </Pressable>
      ))}
    </View>
  );

  const near = (
    <Card>
      <CardTitle title={air(lang, 'health.near.title', { place: home?.name ?? '—' })} />
      {list(air(lang, 'health.near.pharmacy'), nearest.pharmacy)}
      {list(air(lang, 'health.near.hospital'), nearest.hospital)}
      <SourceLine meta={bundled.facilities.meta} asOf={t(lang, 'sources.asof')} licence={t(lang, 'sources.license')} />
    </Card>
  );

  return (
    <Screen tab="health" title={air(lang, 'health.title')} lead={air(lang, 'health.lead')}>
      <Columns
        columns={columns}
        left={
          <>
            {plan}
            {doctor}
          </>
        }
        right={near}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  planRow: { gap: 6, padding: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  planDay: { fontSize: 16, fontWeight: '700' },
  planText: { fontSize: 15, lineHeight: 21 },
  listTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 2.2 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  dot: { width: 10, height: 10, borderRadius: 5 },
  placeName: { fontSize: 15, fontWeight: '600' },
  placeSub: { fontSize: 12.5 },
  dist: { fontSize: 13, fontWeight: '600' },
});
