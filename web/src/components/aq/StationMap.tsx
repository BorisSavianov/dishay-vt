'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeoJSONSource, GeoJSONSourceSpecification, Map as MapLibreMap, MapMouseEvent, Popup } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ATTRIBUTION, cssVar, popupNode, STYLE } from '@/components/charts/LiveMap';
import { useTheme, type Theme } from '@/components/shell/useTheme';
import { levelCounts, type MapFrames } from '@/lib/aq/frames';
import { clampLevel, LEVEL_COLORS, levelTextColor, type Level } from '@/lib/aq/levels';
import { levelName } from '@/lib/aq/strings';
import { outerRings } from '@/lib/geo';
import type { Lang, Point, RegionGeometry } from '@/lib/types';

export type StationMapLabels = {
  alt: string;
  fallback: string;
  hour: string;
  play: string;
  pause: string;
  view: string;
  vt: string;
  bg: string;
  health: string;
  open: string;
  legend: string;
  nodata: string;
  table: string;
  now: string;
  ahead: string; // has {hours}
  station: string;
  city: string;
  level: string;
  zoomIn: string;
  zoomOut: string;
  resetNorth: string;
};

type Data = GeoJSONSourceSpecification['data'];
type View = 'vt' | 'bg';

const NO_DATA = '#9aa0b8';
const FRAME_MS = 280;
const GIVE_UP_MS = 15_000;
const BULGARIA: [[number, number], [number, number]] = [
  [22.35, 41.23],
  [28.61, 44.22],
];

function stationData(frames: MapFrames, hour: number): Data {
  return {
    type: 'FeatureCollection',
    features: frames.stations.map((s, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      properties: { i, level: s.levels[hour] ?? 0 },
    })),
  };
}

function healthData(points: Point[]): Data {
  return {
    type: 'FeatureCollection',
    features: points.map((p, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
      properties: { i, type: p.type },
    })),
  };
}

// Bounds of the featured (Veliko Tarnovo) stations, padded so a single sensor still shows its town.
function vtBounds(frames: MapFrames): [[number, number], [number, number]] {
  const vt = frames.stations.filter((s) => s.featured);
  const list = vt.length > 0 ? vt : frames.stations;
  const lons = list.map((s) => s.lon);
  const lats = list.map((s) => s.lat);
  const pad = 0.04;
  return [
    [Math.min(...lons) - pad, Math.min(...lats) - pad],
    [Math.max(...lons) + pad, Math.max(...lats) + pad],
  ];
}

function chip(level: number, lang: Lang, nodata: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'level-chip';
  if (level === 0) {
    el.textContent = nodata;
    el.style.background = NO_DATA;
    el.style.color = '#ffffff';
    return el;
  }
  const l = clampLevel(level);
  el.textContent = `${l} · ${levelName(lang, l)}`;
  el.style.background = LEVEL_COLORS[l];
  el.style.color = levelTextColor(l);
  return el;
}

// Sensors coloured by forecast level, hour by hour, with a slider and a play button. Pharmacies, hospitals and
// doctors from OpenStreetMap can be shown on top. If the map cannot start, the table below still has every level.
export function StationMap({
  frames,
  timeLabels,
  health,
  region,
  lang,
  labels,
}: {
  frames: MapFrames;
  timeLabels: string[];
  health: Point[];
  region: RegionGeometry;
  lang: Lang;
  labels: StationMapLabels;
}) {
  const theme = useTheme();
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showHealth, setShowHealth] = useState(true);
  const [view, setView] = useState<View>('vt');
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const shownTheme = useRef<Theme>(theme);
  const popup = useRef<{ popup: Popup; station: number } | null>(null);
  const live = useRef({ frames, hour, showHealth, health, region, lang, theme, timeLabels, labels });
  useEffect(() => {
    live.current = { frames, hour, showHealth, health, region, lang, theme, timeLabels, labels };
  });

  const last = Math.max(frames.times.length - 1, 0);
  const counts = useMemo(() => levelCounts(frames, hour), [frames, hour]);

  // The popup of a station: its level and PM2.5 at the chosen hour, and a link to its forecast.
  function stationPopup(i: number): HTMLElement {
    const { frames: f, hour: h, lang: l, timeLabels: times, labels: lb } = live.current;
    const s = f.stations[i]!;
    const root = document.createElement('div');
    root.className = 'map-popup';
    const title = document.createElement('h3');
    title.textContent = s.name;
    const city = document.createElement('p');
    city.className = 'map-popup-note';
    city.textContent = `${s.city} · ${times[h] ?? ''}`;
    const value = document.createElement('p');
    const pm = s.pm25[h] ?? -1;
    value.textContent = pm >= 0 ? `PM2.5 ${pm} µg/m³` : lb.nodata;
    const link = document.createElement('a');
    link.href = `/?station=${encodeURIComponent(s.id)}&lang=${l}`;
    link.textContent = lb.open;
    root.append(title, city, chip(s.levels[h] ?? 0, l, lb.nodata), value, link);
    return root;
  }

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let map: MapLibreMap | null = null;

    function addOverlays(m: MapLibreMap) {
      const now = live.current;
      const surface = cssVar('--surface', '#ffffff');
      const accent = cssVar('--accent', '#4f46e5');
      const fg = cssVar('--fg', '#12163a');
      const colour = ['match', ['get', 'level'], ...([1, 2, 3, 4, 5, 6] as Level[]).flatMap((l) => [l, LEVEL_COLORS[l]]), NO_DATA];

      m.addSource('region', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: now.region } });
      m.addLayer({
        id: 'region-line',
        type: 'line',
        source: 'region',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': accent, 'line-width': 1.5, 'line-dasharray': [2, 1.5], 'line-opacity': 0.7 },
      });

      m.addSource('health', { type: 'geojson', data: healthData(now.health) });
      m.addLayer({
        id: 'health',
        type: 'circle',
        source: 'health',
        layout: { visibility: now.showHealth ? 'visible' : 'none' },
        paint: {
          // Neutral, hollow markers, so they never read as an air level. Hospitals are larger.
          'circle-color': surface,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, ['case', ['==', ['get', 'type'], 'hospital'], 3.5, 2.5], 13, ['case', ['==', ['get', 'type'], 'hospital'], 7, 5]],
          'circle-stroke-color': fg,
          'circle-stroke-width': ['case', ['==', ['get', 'type'], 'hospital'], 2.5, 1.5],
          'circle-stroke-opacity': 0.75,
        },
      });

      m.addSource('stations', { type: 'geojson', data: stationData(now.frames, now.hour) });
      m.addLayer({
        id: 'stations',
        type: 'circle',
        source: 'stations',
        // Worse air is drawn on top.
        layout: { 'circle-sort-key': ['get', 'level'] },
        paint: {
          'circle-color': colour as never,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 10, 8, 14, 12],
          'circle-stroke-color': surface,
          'circle-stroke-width': 2,
          'circle-color-transition': { duration: 200 },
        },
      });
    }

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
        const lb = live.current.labels;
        shownTheme.current = live.current.theme;
        map = new maplibre.Map({
          container: el,
          style: STYLE[live.current.theme],
          bounds: vtBounds(live.current.frames),
          fitBoundsOptions: { padding: 30, maxZoom: 12 },
          attributionControl: false,
          locale: {
            'NavigationControl.ZoomIn': lb.zoomIn,
            'NavigationControl.ZoomOut': lb.zoomOut,
            'NavigationControl.ResetBearing': lb.resetNorth,
          },
        });
        mapRef.current = map;
        map.addControl(new maplibre.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }));
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        map.on('style.load', () => map && addOverlays(map));
        map.on('load', () => {
          window.clearTimeout(timer);
          const credit = el.querySelector('.maplibregl-ctrl-attrib');
          credit?.removeAttribute('open');
          credit?.classList.remove('maplibregl-compact-show');
        });
        arm();

        type Click = MapMouseEvent & { features?: { properties?: Record<string, unknown> }[] };
        map.on('click', 'stations', (e: Click) => {
          const i = Number(e.features?.[0]?.properties?.i);
          const s = live.current.frames.stations[i];
          if (!s || !map) return;
          popup.current?.popup.remove();
          const p = new maplibre.Popup({ maxWidth: '260px', offset: 12 }).setLngLat([s.lon, s.lat]).setDOMContent(stationPopup(i)).addTo(map);
          popup.current = { popup: p, station: i };
          p.on('close', () => {
            if (popup.current?.popup === p) popup.current = null;
          });
        });
        map.on('click', 'health', (e: Click) => {
          const i = Number(e.features?.[0]?.properties?.i);
          const p = live.current.health[i];
          if (!p || !map) return;
          popup.current?.popup.remove();
          new maplibre.Popup({ maxWidth: '280px', offset: 8 }).setLngLat([p.lon, p.lat]).setDOMContent(popupNode(live.current.lang, p)).addTo(map);
        });
        for (const layer of ['stations', 'health']) {
          map.on('mouseenter', layer, () => map && (map.getCanvas().style.cursor = 'pointer'));
          map.on('mouseleave', layer, () => map && (map.getCanvas().style.cursor = ''));
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || shownTheme.current === theme) return;
    shownTheme.current = theme;
    map.setStyle(STYLE[theme]);
  }, [theme]);

  // A new hour recolours the stations and refreshes an open popup.
  useEffect(() => {
    (mapRef.current?.getSource('stations') as GeoJSONSource | undefined)?.setData(stationData(frames, hour));
    const open = popup.current;
    if (open) open.popup.setDOMContent(stationPopup(open.station));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, hour]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer('health')) map.setLayoutProperty('health', 'visibility', showHealth ? 'visible' : 'none');
  }, [showHealth]);

  useEffect(() => {
    mapRef.current?.fitBounds(view === 'vt' ? vtBounds(frames) : BULGARIA, { padding: 30, maxZoom: 12, duration: 900 });
  }, [view, frames]);

  // Play steps one hour every FRAME_MS and loops back to now.
  useEffect(() => {
    if (!playing || last === 0) return;
    const id = window.setInterval(() => setHour((h) => (h >= last ? 0 : h + 1)), FRAME_MS);
    return () => window.clearInterval(id);
  }, [playing, last]);

  const ranked = useMemo(
    () => [...frames.stations].sort((a, b) => (b.levels[hour] ?? 0) - (a.levels[hour] ?? 0) || (b.pm25[hour] ?? 0) - (a.pm25[hour] ?? 0)),
    [frames, hour],
  );

  if (frames.times.length === 0) return <p className="notice">{labels.nodata}</p>;

  return (
    <div className="station-map">
      {failed ? (
        <p className="notice" role="status">
          {labels.fallback}
        </p>
      ) : (
        <div ref={box} className="map-canvas map-canvas-lg" role="region" aria-label={labels.alt} />
      )}

      <div className="time-bar">
        <button
          type="button"
          className="btn btn-primary play-btn"
          aria-pressed={playing}
          onClick={() => setPlaying((p) => !p)}
        >
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
          {playing ? labels.pause : labels.play}
        </button>
        <label className="time-slider">
          <span className="time-readout">
            <strong>{timeLabels[hour]}</strong>
            <span>{hour === 0 ? labels.now : labels.ahead.replace('{hours}', String(hour))}</span>
          </span>
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={hour}
            aria-label={labels.hour}
            aria-valuetext={timeLabels[hour]}
            onChange={(e) => {
              setPlaying(false);
              setHour(Number(e.target.value));
            }}
          />
        </label>
        <div className="seg" role="group" aria-label={labels.view}>
          {(['vt', 'bg'] as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'vt' ? labels.vt : labels.bg}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={showHealth} onChange={(e) => setShowHealth(e.target.checked)} />
          {labels.health}
        </label>
      </div>

      <ul className="level-legend" aria-label={labels.legend}>
        {([1, 2, 3, 4, 5, 6] as Level[]).map((l) => (
          <li key={l}>
            <span className="swatch" style={{ background: LEVEL_COLORS[l] }} />
            {levelName(lang, l)}
            <span className="num">{counts[l]}</span>
          </li>
        ))}
        {showHealth && (
          <li>
            <span className="swatch swatch-health" />
            {labels.health}
          </li>
        )}
        {counts[0]! > 0 && (
          <li>
            <span className="swatch" style={{ background: NO_DATA }} />
            {labels.nodata}
            <span className="num">{counts[0]}</span>
          </li>
        )}
      </ul>

      <details className="data-table" open={failed}>
        <summary>{labels.table}</summary>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{labels.station}</th>
                <th scope="col">{labels.city}</th>
                <th scope="col">{labels.level}</th>
                <th scope="col">PM2.5</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s) => {
                const l = s.levels[hour] ?? 0;
                return (
                  <tr key={s.id}>
                    <th scope="row">
                      <a href={`/?station=${encodeURIComponent(s.id)}&lang=${lang}`}>{s.name}</a>
                    </th>
                    <td>{s.city}</td>
                    <td>{l === 0 ? labels.nodata : `${l} · ${levelName(lang, clampLevel(l))}`}</td>
                    <td>{(s.pm25[hour] ?? -1) >= 0 ? s.pm25[hour] : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
