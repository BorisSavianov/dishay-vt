import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { LEVEL_COLORS, levelNow, levelOf, levelTextColor, type Level } from '../aq/levels';
import { air, levelName } from '../aq/strings';
import type { AqStation } from '../aq/types';
import { useColorMode } from '../lib/color-mode';
import type { Lang } from '../shared/types';
import { Segmented } from './Segmented';

type Horizon = '0' | '24' | '48' | '72';

// Level and PM2.5 of a station `hours` ahead: now from levelNow, later from the hourly forecast.
function at(s: AqStation, hours: number, now: Date): { level: Level; pm25: number } | null {
  if (hours === 0) return levelNow(s, now);
  if (!s.hourly?.length) return null;
  const target = now.getTime() + hours * 3600_000;
  let best = s.hourly[0]!;
  for (const h of s.hourly) if (Math.abs(new Date(h.t).getTime() - target) < Math.abs(new Date(best.t).getTime() - target)) best = h;
  return { level: levelOf(best.pm25, best.pm10), pm25: best.pm25 };
}

// Every station as a coloured dot with its PM2.5 number, for now or 24/48/72 hours ahead.
// Opens on Veliko Tarnovo; zoom out for the rest of Bulgaria.
export function AirMap({
  stations,
  homeId,
  lang,
  onPick,
}: {
  stations: AqStation[];
  homeId: string | null;
  lang: Lang;
  onPick?: (s: AqStation) => void;
}) {
  const { mode, colors: c } = useColorMode();
  const [h, setH] = useState<Horizon>('0');
  const now = useMemo(() => new Date(), []);
  const values = useMemo(() => stations.map((s) => ({ s, v: at(s, Number(h), now) })), [stations, h, now]);

  return (
    <View style={{ gap: 12 }}>
      <Segmented
        label={air(lang, 'air.map.title')}
        value={h}
        onChange={(k) => {
          void Haptics.selectionAsync();
          setH(k);
        }}
        options={[
          { key: '0', label: air(lang, 'air.map.now') },
          { key: '24', label: `+24 ${lang === 'bg' ? 'ч' : 'h'}` },
          { key: '48', label: `+48 ${lang === 'bg' ? 'ч' : 'h'}` },
          { key: '72', label: `+72 ${lang === 'bg' ? 'ч' : 'h'}` },
        ]}
      />
      <View style={[styles.map, { borderColor: c.line, backgroundColor: c.card2 }]}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={{ latitude: 43.08, longitude: 25.63, latitudeDelta: 0.22, longitudeDelta: 0.22 }}
          userInterfaceStyle={mode}
          rotateEnabled={false}
          pitchEnabled={false}
          showsPointsOfInterests={false}
          accessibilityLabel={air(lang, 'air.map.title')}
        >
          {values.map(({ s, v }) => {
            const lv = v?.level;
            const home = s.id === homeId;
            return (
              <Marker
                key={`${s.id}-${h}-${mode}`}
                coordinate={{ latitude: s.lat, longitude: s.lon }}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={home ? 5 : 2}
                tracksViewChanges={false}
                onCalloutPress={() => onPick?.(s)}
                title={s.name}
                description={lv ? `${levelName(lang, lv)} · PM2.5 ${Math.round(v!.pm25)} µg/m³` : s.city}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: lv ? LEVEL_COLORS[lv] : c.muted,
                      borderColor: home ? c.fg : '#ffffff',
                      borderWidth: home ? 3 : 2,
                    },
                  ]}
                >
                  <Text style={[styles.dotText, { color: lv ? levelTextColor(lv) : '#fff' }]}>{v ? Math.round(v.pm25) : '–'}</Text>
                </View>
              </Marker>
            );
          })}
        </MapView>
      </View>
      <View style={styles.legend}>
        {([1, 2, 3, 4, 5, 6] as Level[]).map((l) => (
          <View key={l} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: LEVEL_COLORS[l] }]} />
            <Text style={[styles.legendText, { color: c.muted }]}>{levelName(lang, l)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 380, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  dot: { minWidth: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dotText: { fontSize: 12, fontWeight: '800' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 12 },
});
