'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type {
  ExpressionSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
  MapMouseEvent,
} from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme, type Theme } from '@/components/shell/useTheme';
import { outerRings } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { typeColor } from '@/lib/palette';
import { pinDetails } from '@/lib/pin';
import type { Lang, Point, RegionGeometry } from '@/lib/types';
import { FacilityMap } from './FacilityMap';
import { MapLegend, type MapType } from './MapLegend';

export type LiveMapLabels = {
  alt: string;
  typeHeading: string;
  shownLabel: string; // has {count} and {total}
  fallback: string;
  zoomIn: string;
  zoomOut: string;
  resetNorth: string;
};

type Data = GeoJSONSourceSpecification['data'];

// Free vector tiles from OpenFreeMap: no key, OpenStreetMap data. Light and dark follow the site theme.
const STYLE: Record<Theme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/fiord',
};
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const GIVE_UP_MS = 15_000;
const WORLD = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// MapLibre cannot read CSS variables, so the type colours are read from the active theme.
function colourOf(type: string): string {
  const v = typeColor(type);
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  return m ? cssVar(m[1]!, '#64748b') : v;
}

function featuresOf(points: Point[], hidden: Set<string>): Data {
  return {
    type: 'FeatureCollection',
    features: points.flatMap((p, i) =>
      hidden.has(p.type)
        ? []
        : [
            {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
              // rank puts health facilities above the many bus stops.
              properties: { i, type: p.type, rank: p.type === 'bus_stop' ? 0 : 1 },
            },
          ],
    ),
  };
}

function popupNode(lang: Lang, p: Point): HTMLElement {
  const d = pinDetails(lang, p);
  const root = document.createElement('div');
  root.className = 'map-popup';
  const title = document.createElement('h3');
  title.textContent = d.title;
  root.append(title);
  if (d.rows.length > 0) {
    const list = document.createElement('dl');
    for (const row of d.rows) {
      const dt = document.createElement('dt');
      dt.textContent = row.label;
      const dd = document.createElement('dd');
      dd.textContent = row.value;
      list.append(dt, dd);
    }
    root.append(list);
  }
  if (!p.name) {
    const note = document.createElement('p');
    note.className = 'map-popup-note';
    note.textContent = t(lang, 'pin.noname');
    root.append(note);
  }
  if (d.website) {
    const link = document.createElement('a');
    link.href = d.website;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = t(lang, 'pin.website');
    root.append(link);
  }
  return root;
}

// The real map: OpenStreetMap basemap, the province outline, and every facility as a pin that clusters when
// zoomed out. If the map cannot start or load (no WebGL, blocked tiles), the dot map takes its place.
export function LiveMap({
  points,
  types,
  region,
  lang,
  labels,
  large = false,
  interactive = true,
}: {
  points: Point[];
  types: MapType[];
  region: RegionGeometry;
  lang: Lang;
  labels: LiveMapLabels;
  large?: boolean;
  interactive?: boolean;
}) {
  const theme = useTheme();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const shownTheme = useRef<Theme>(theme);
  // The map callbacks outlive renders, so they read the latest values from here.
  const live = useRef({ points, hidden, lang, theme, types, region });
  useEffect(() => {
    live.current = { points, hidden, lang, theme, types, region };
  });

  const shown = useMemo(() => points.filter((p) => !hidden.has(p.type)).length, [points, hidden]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let map: MapLibreMap | null = null;

    function addOverlays(m: MapLibreMap) {
      const now = live.current;
      const dark = now.theme === 'dark';
      const accent = cssVar('--accent', '#4f46e5');
      const surface = cssVar('--surface', '#ffffff');
      const onAccent = cssVar('--on-accent', '#ffffff');
      const pairs = now.types.flatMap((ty) => [ty.type, colourOf(ty.type)]);
      const colour = ['match', ['get', 'type'], ...(pairs.length > 0 ? pairs : ['none', '#64748b']), colourOf('other')];
      const isBus: ExpressionSpecification = ['==', ['get', 'type'], 'bus_stop'];

      // Everything outside the province is dimmed: a polygon covering the world with the province cut out.
      m.addSource('region-mask', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [WORLD, ...outerRings(now.region)] },
        },
      });
      m.addLayer({
        id: 'region-mask',
        type: 'fill',
        source: 'region-mask',
        paint: { 'fill-color': dark ? '#000000' : '#12163a', 'fill-opacity': dark ? 0.35 : 0.1 },
      });
      m.addSource('region', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: now.region } });
      m.addLayer({
        id: 'region-line',
        type: 'line',
        source: 'region',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': accent, 'line-width': 2, 'line-dasharray': [2, 1.5] },
      });

      m.addSource('facilities', {
        type: 'geojson',
        data: featuresOf(now.points, now.hidden),
        cluster: true,
        clusterRadius: 42,
        clusterMaxZoom: 12,
      });
      m.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'facilities',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': accent,
          'circle-opacity': 0.9,
          'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
          'circle-stroke-color': surface,
          'circle-stroke-width': 2,
        },
      });
      m.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'facilities',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': onAccent },
      });
      m.addLayer({
        id: 'points',
        type: 'circle',
        source: 'facilities',
        filter: ['!', ['has', 'point_count']],
        layout: { 'circle-sort-key': ['get', 'rank'] },
        paint: {
          'circle-color': colour as never,
          'circle-radius': ['case', isBus, 4, 6.5],
          'circle-opacity': ['case', isBus, 0.8, 0.95],
          'circle-stroke-color': surface,
          'circle-stroke-width': ['case', isBus, 0.75, 1.5],
        },
      });
    }

    // A page in a background tab gets no animation frames, so the map cannot finish loading there.
    // The wait only counts while the page is visible.
    function arm() {
      timer = window.setTimeout(() => (document.hidden ? arm() : giveUp()), GIVE_UP_MS);
    }

    function giveUp() {
      if (cancelled) return;
      map?.remove();
      mapRef.current = null;
      setFailed(true);
    }

    (async () => {
      try {
        const maplibre = (await import('maplibre-gl')).default;
        const el = box.current;
        if (cancelled || !el) return;
        const rings = outerRings(live.current.region).flat();
        const lons = rings.map((r) => r[0]!);
        const lats = rings.map((r) => r[1]!);
        // The first render uses the server's theme, so the style the map starts with is noted here.
        shownTheme.current = live.current.theme;
        map = new maplibre.Map({
          container: el,
          style: STYLE[live.current.theme],
          bounds: [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          fitBoundsOptions: { padding: 20 },
          interactive,
          attributionControl: false,
          locale: {
            'NavigationControl.ZoomIn': labels.zoomIn,
            'NavigationControl.ZoomOut': labels.zoomOut,
            'NavigationControl.ResetBearing': labels.resetNorth,
          },
        });
        mapRef.current = map;
        map.addControl(new maplibre.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }));
        if (interactive) map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');

        map.on('style.load', () => map && addOverlays(map));
        map.on('load', () => {
          window.clearTimeout(timer);
          // The credit starts folded behind its (i) button so it does not cover the map.
          const credit = el.querySelector('.maplibregl-ctrl-attrib');
          credit?.removeAttribute('open');
          credit?.classList.remove('maplibregl-compact-show');
        });
        arm();

        if (interactive) {
          let popup: InstanceType<typeof maplibre.Popup> | null = null;
          map.on('click', 'points', (e: MapMouseEvent & { features?: { properties?: Record<string, unknown> }[] }) => {
            const f = e.features?.[0];
            const i = Number(f?.properties?.i);
            const p = live.current.points[i];
            if (!f || !p || !map) return;
            popup?.remove();
            popup = new maplibre.Popup({ maxWidth: '280px', offset: 10 })
              .setLngLat([p.lon, p.lat])
              .setDOMContent(popupNode(live.current.lang, p))
              .addTo(map);
          });
          map.on('click', 'clusters', (e: MapMouseEvent & { features?: { properties?: Record<string, unknown> }[] }) => {
            const id = Number(e.features?.[0]?.properties?.cluster_id);
            const source = map?.getSource('facilities') as GeoJSONSource | undefined;
            if (!source || Number.isNaN(id)) return;
            void source.getClusterExpansionZoom(id).then((zoom) => map?.easeTo({ center: e.lngLat, zoom: zoom + 0.5 }));
          });
          for (const layer of ['points', 'clusters']) {
            map.on('mouseenter', layer, () => map && (map.getCanvas().style.cursor = 'pointer'));
            map.on('mouseleave', layer, () => map && (map.getCanvas().style.cursor = ''));
          }
        }
      } catch {
        giveUp();
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once. Later changes reach it through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A theme change loads the other style. The overlays are added again when it has loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || shownTheme.current === theme) return;
    shownTheme.current = theme;
    map.setStyle(STYLE[theme]);
  }, [theme]);

  // The legend filter changes which pins are in the source, so the clusters are counted again.
  useEffect(() => {
    const source = mapRef.current?.getSource('facilities') as GeoJSONSource | undefined;
    source?.setData(featuresOf(points, hidden));
  }, [points, hidden]);

  function toggle(type: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  if (failed) {
    return (
      <>
        <p className="notice" role="status">
          {labels.fallback}
        </p>
        <FacilityMap
          points={points.map((p) => ({ lat: p.lat, lon: p.lon, type: p.type }))}
          types={types}
          lang={lang}
          alt={labels.alt}
          typeHeading={labels.typeHeading}
          shownLabel={labels.shownLabel}
          large={large}
        />
      </>
    );
  }

  return (
    <div className={`map${large ? ' map-lg' : ''}`}>
      <div
        ref={box}
        className={`map-canvas${large ? ' map-canvas-lg' : ''}`}
        role="region"
        aria-label={labels.alt}
        data-interactive={interactive}
      />
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
    </div>
  );
}
