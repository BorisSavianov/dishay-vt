import { useNetInfo } from '@react-native-community/netinfo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polygon, type Region as MapRegion } from 'react-native-maps';
import Supercluster from 'supercluster';
import { useColorMode } from '../lib/color-mode';
import { bboxOf, regionAt, regionFitting, zoomOf } from '../lib/map-math';
import { ui } from '../lib/ui-strings';
import { boundsOf, outerRings } from '../shared/geo';
import { pinDetails } from '../shared/pin';
import type { Lang, Point, RegionGeometry } from '../shared/types';
import type { PointType } from '../theme/palette';
import { FacilityMap } from './FacilityMap';
import { Icon } from './Icon';
import { MapLegend, type MapType } from './MapLegend';

export type LiveMapLabels = {
  alt: string;
  typeHeading: string;
  shownLabel: string; // has {count} and {total}
  fallback: string;
};

const GIVE_UP_MS = 15_000;
// The same clustering as the web map: pins within 42 px merge, and from zoom 12 up every pin stands alone.
const CLUSTER_RADIUS = 42;
const CLUSTER_MAX_ZOOM = 12;
const MAP_HEIGHT = 380;
const PREVIEW_HEIGHT = 240;
// A box far larger than the province. The province is cut out of it, so only the outside is dimmed.
const SURROUND = [
  { latitude: 38, longitude: 18 },
  { latitude: 38, longitude: 34 },
  { latitude: 48, longitude: 34 },
  { latitude: 48, longitude: 18 },
];

type PinProps = { i: number };
type Item =
  | { kind: 'cluster'; id: number; count: number; latitude: number; longitude: number }
  | { kind: 'pin'; i: number; latitude: number; longitude: number };

// The real map: Apple Maps on iOS. Every point is a pin on its place, pins merge into counted clusters
// when zoomed out, and the province outline is drawn on top. Offline, it gives way to the dot map.
export function LiveMap({
  points,
  types,
  region,
  lang,
  labels,
  preview = false,
  onOpen,
}: {
  points: Point[];
  types: MapType[];
  region: RegionGeometry;
  lang: Lang;
  labels: LiveMapLabels;
  // A small map for the Dashboard: it cannot be moved, has no legend or details, and a tap opens the full map.
  preview?: boolean;
  onOpen?: () => void;
}) {
  const { mode, colors: c } = useColorMode();
  const net = useNetInfo();
  const mapRef = useRef<MapView>(null);
  const markerTap = useRef(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: MAP_HEIGHT });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const rings = useMemo(() => outerRings(region), [region]);
  const holes = useMemo(() => rings.map((ring) => ring.map(([lon, lat]) => ({ latitude: lat!, longitude: lon! }))), [rings]);
  const start = useMemo(() => {
    const box = boundsOf(rings.flat().map(([lon, lat]) => ({ lat: lat!, lon: lon! })));
    return box ? regionFitting(box) : { latitude: 43.08, longitude: 25.63, latitudeDelta: 1, longitudeDelta: 1 };
  }, [rings]);
  const [view, setView] = useState<MapRegion>(start);

  // The index holds only the types that are switched on, so the clusters are counted again on a filter change.
  const index = useMemo(() => {
    const tree = new Supercluster<PinProps>({ radius: CLUSTER_RADIUS, maxZoom: CLUSTER_MAX_ZOOM });
    tree.load(
      points.flatMap((p, i) =>
        hidden.has(p.type)
          ? []
          : [{ type: 'Feature' as const, properties: { i }, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] } }],
      ),
    );
    return tree;
  }, [points, hidden]);

  // Supercluster counts zoom on 512 px tiles, the map on 256 px tiles, so its zoom is one lower.
  const zoom256 = size.width > 0 ? zoomOf(view, size.width) : 0;
  const items = useMemo<Item[]>(() => {
    if (size.width === 0) return [];
    const [w, s, e, n] = bboxOf(view);
    const padLon = (e - w) * 0.25;
    const padLat = (n - s) * 0.25;
    const z = Math.max(0, Math.min(Math.floor(zoom256 - 1), 17));
    return index.getClusters([w - padLon, s - padLat, e + padLon, n + padLat], z).map((f): Item => {
      const [longitude, latitude] = f.geometry.coordinates as [number, number];
      const props = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; i?: number };
      return props.cluster
        ? { kind: 'cluster', id: props.cluster_id!, count: props.point_count!, latitude: latitude!, longitude }
        : { kind: 'pin', i: props.i!, latitude: latitude!, longitude };
    });
  }, [index, view, zoom256, size.width]);

  const shown = useMemo(() => points.filter((p) => !hidden.has(p.type)).length, [points, hidden]);

  // Apple Maps sends onMapReady when it starts to draw. A map that never gets there is replaced by the dot map.
  // The wait only counts while the app is in front.
  useEffect(() => {
    if (ready || failed) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => (AppState.currentState === 'active' ? setFailed(true) : arm()), GIVE_UP_MS);
    };
    arm();
    return () => clearTimeout(timer);
  }, [ready, failed]);

  const toggle = useCallback((type: string) => {
    setSelected(null);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  function zoomInto(item: Extract<Item, { kind: 'cluster' }>) {
    const target = index.getClusterExpansionZoom(item.id) + 1.5; // +1 for 256 px tiles, +0.5 to clear the cluster
    mapRef.current?.animateToRegion(regionAt(item, target, size.width, size.height), 450);
  }

  const colourOf = (type: string) => c.points[type as PointType] ?? c.muted;

  // Apple Maps needs no key. Android would need a Google Maps key, so there the dot map stays.
  const offline = net.isConnected === false;
  if (Platform.OS !== 'ios' || failed || offline) {
    return (
      <View style={{ gap: 14 }}>
        <Text style={[styles.notice, { color: c.muted, backgroundColor: c.card2, borderColor: c.line }]} accessibilityRole="alert">
          {labels.fallback}
        </Text>
        <FacilityMap
          points={points.map((p) => ({ lat: p.lat, lon: p.lon, type: p.type }))}
          types={types}
          lang={lang}
          alt={labels.alt}
          typeHeading={labels.typeHeading}
          shownLabel={labels.shownLabel}
        />
      </View>
    );
  }

  const point = selected === null ? null : points[selected];
  const details = point ? pinDetails(lang, point) : null;

  return (
    <View style={{ gap: 14 }}>
      <View
        style={[styles.map, { backgroundColor: c.card2, borderColor: c.line, height: preview ? PREVIEW_HEIGHT : MAP_HEIGHT }]}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={start}
          userInterfaceStyle={mode}
          rotateEnabled={false}
          pitchEnabled={false}
          scrollEnabled={!preview}
          zoomEnabled={!preview}
          showsPointsOfInterests={false}
          accessibilityLabel={labels.alt}
          onMapReady={() => setReady(true)}
          onRegionChangeComplete={setView}
          onPress={() => {
            if (preview) return onOpen?.();
            // A pin tap may also reach the map. The map's own tap clears the selection only when no pin was tapped.
            setTimeout(() => {
              if (Date.now() - markerTap.current > 400) setSelected(null);
            }, 120);
          }}
        >
          <Polygon
            coordinates={SURROUND}
            holes={holes}
            fillColor={mode === 'dark' ? 'rgba(5,7,22,0.4)' : 'rgba(18,22,58,0.16)'}
            strokeColor="transparent"
            strokeWidth={0}
          />
          {holes.map((ring, i) => (
            <Polygon
              key={i}
              coordinates={ring}
              fillColor="transparent"
              strokeColor={c.accent}
              strokeWidth={2}
              lineDashPattern={[6, 5]}
            />
          ))}
          {items.map((item) =>
            item.kind === 'cluster' ? (
              <Marker
                key={`c${item.id}-${item.count}-${mode}`}
                coordinate={item}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={3}
                onPress={() => (preview ? onOpen?.() : zoomInto(item))}
              >
                <View
                  style={[
                    styles.cluster,
                    {
                      width: clusterSize(item.count),
                      height: clusterSize(item.count),
                      backgroundColor: c.accent,
                      borderColor: c.card,
                    },
                  ]}
                >
                  <Text style={[styles.clusterText, { color: c.onAccent }]}>{item.count}</Text>
                </View>
              </Marker>
            ) : (
              <Marker
                key={`p${item.i}-${selected === item.i}-${mode}`}
                coordinate={item}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={points[item.i]!.type === 'bus_stop' ? 1 : 2}
                onPress={() => {
                  if (preview) return onOpen?.();
                  markerTap.current = Date.now();
                  setSelected(item.i);
                }}
              >
                <View
                  style={[
                    styles.pin,
                    {
                      width: points[item.i]!.type === 'bus_stop' ? 16 : 24,
                      height: points[item.i]!.type === 'bus_stop' ? 16 : 24,
                      backgroundColor: colourOf(points[item.i]!.type),
                      borderColor: selected === item.i ? c.fg : c.card,
                      borderWidth: selected === item.i ? 3 : 2,
                    },
                  ]}
                />
              </Marker>
            ),
          )}
        </MapView>

        {details ? (
          <View style={[styles.sheet, { backgroundColor: c.card, borderColor: c.line }]}>
            <View style={styles.sheetHead}>
              <Text style={[styles.sheetTitle, { color: c.fg }]} numberOfLines={2}>
                {details.title}
              </Text>
              <Pressable
                onPress={() => setSelected(null)}
                accessibilityRole="button"
                accessibilityLabel={ui(lang, 'map.close')}
                hitSlop={8}
                style={styles.close}
              >
                <Icon name="close" color={c.muted} size={20} />
              </Pressable>
            </View>
            {details.rows.map((row) => (
              <Text key={row.label} style={[styles.row, { color: c.muted }]}>
                <Text style={{ fontWeight: '600' }}>{row.label}: </Text>
                <Text style={{ color: c.fg }}>{row.value}</Text>
              </Text>
            ))}
            {details.website ? (
              <Pressable
                onPress={() => void Linking.openURL(details.website!)}
                accessibilityRole="link"
                accessibilityLabel={ui(lang, 'map.website')}
                style={styles.link}
              >
                <Text style={[styles.linkText, { color: c.accentStrong }]} numberOfLines={1}>
                  {ui(lang, 'map.website')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {preview ? null : (
        <MapLegend
          types={types}
          hidden={hidden}
          onToggle={toggle}
          lang={lang}
          typeHeading={labels.typeHeading}
          shownLabel={labels.shownLabel}
          shown={shown}
          total={points.length}
        />
      )}
    </View>
  );
}

function clusterSize(count: number): number {
  return 32 + Math.min(Math.log10(count) / 2.5, 1) * 22; // 32 pt for 1, up to 54 pt around 300
}

const styles = StyleSheet.create({
  map: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  notice: { fontSize: 13, padding: 12, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  pin: { borderRadius: 999 },
  cluster: { borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  clusterText: { fontSize: 13, fontWeight: '700' },
  sheet: { position: 'absolute', left: 10, right: 10, bottom: 10, padding: 14, borderRadius: 14, borderWidth: 1, gap: 4 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  row: { fontSize: 14 },
  link: { minHeight: 36, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
