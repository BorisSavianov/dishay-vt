'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { linePath, nearestIndex, niceTicks } from '@/lib/chart';
import { LEVEL_COLORS, PM10_BANDS, PM25_BANDS, type Level } from '@/lib/aq/levels';
import { fmtPm, hourLabel, sofiaHour } from '@/lib/aq/format';
import type { AqHour } from '@/lib/aq/types';
import type { Lang } from '@/lib/types';

type Pm = 'pm25' | 'pm10';

export type ForecastLabels = {
  title: string;
  subtitle: string;
  pollutant: string;
  ours: string;
  cams: string;
  band: string;
  alt: string; // still has {pm}
  table: string;
  hour: string;
  now: string;
  readout: string; // still has {time} and {value}
};

const HEIGHT = 300;
const M = { top: 14, right: 14, bottom: 30, left: 44 };

// 72-hour forecast in plain SVG: the EAQI bands as a faint background, the likely range as a band, our line,
// and the CAMS forecast dashed. Pointer or arrow keys read one hour; the same values are in a table below.
export function ForecastChart({ hourly, lang, labels }: { hourly: AqHour[]; lang: Lang; labels: ForecastLabels }) {
  const [pm, setPm] = useState<Pm>('pm25');
  const [active, setActive] = useState(0);
  const [width, setWidth] = useState(640);
  const box = useRef<HTMLDivElement>(null);
  const clip = useId();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(260, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (hourly.length < 2) return null;

  const value = (h: AqHour) => (pm === 'pm25' ? h.pm25 : h.pm10);
  const hasBand = pm === 'pm25' && hourly.every((h) => h.pm25_lo != null && h.pm25_hi != null);
  const hasCams = pm === 'pm25' && hourly.every((h) => h.cams_pm25 != null);
  const peak = Math.max(...hourly.map((h) => Math.max(value(h), hasBand ? h.pm25_hi! : 0, hasCams ? h.cams_pm25! : 0)));
  const ticks = niceTicks(0, Math.max(peak * 1.08, 10), 5);
  const yMax = ticks[ticks.length - 1] ?? 1;
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const x = (i: number) => M.left + (innerW * i) / (hourly.length - 1);
  const y = (v: number) => M.top + innerH - (Math.min(v, yMax) / yMax) * innerH;
  const xs = hourly.map((_, i) => x(i));

  const bands = pm === 'pm25' ? PM25_BANDS : PM10_BANDS;
  const stripes = [0, ...bands]
    .map((lo, i) => ({ level: (i + 1) as Level, lo, hi: bands[i] ?? Infinity }))
    .filter((s) => s.lo < yMax);

  const line = linePath(hourly.map((h, i) => ({ x: x(i), y: y(value(h)) })));
  const band = hasBand
    ? `${linePath(hourly.map((h, i) => ({ x: x(i), y: y(h.pm25_hi!) })))} ${hourly
        .map((h, i) => ({ x: x(i), y: y(h.pm25_lo!) }))
        .reverse()
        .map((p) => `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ')} Z`
    : null;
  const cams = hasCams ? linePath(hourly.map((h, i) => ({ x: x(i), y: y(h.cams_pm25!) }))) : null;

  // Midnights and the hours to label (every 6 h, or 12 h on a phone).
  const step = innerW < 420 ? 12 : 6;
  const hours = hourly.map((h) => sofiaHour(new Date(h.t)));
  const current = hourly[active] ?? hourly[0]!;
  const fmt = (n: number) => fmtPm(lang, n);
  const pmName = pm === 'pm25' ? 'PM2.5' : 'PM10';
  const readout = labels.readout.replace('{time}', hourLabel(lang, current.t)).replace('{value}', fmt(value(current)));

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(xs, e.clientX - rect.left));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = hourly.length - 1;
    const next =
      e.key === 'ArrowLeft' ? active - 1 : e.key === 'ArrowRight' ? active + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(Math.min(Math.max(next, 0), last));
  }

  return (
    <div>
      <div className="card-head">
        <div>
          <h2 className="card-title">{labels.title}</h2>
          <p className="card-sub">{labels.subtitle}</p>
        </div>
        <div className="seg" role="group" aria-label={labels.pollutant}>
          {(['pm25', 'pm10'] as Pm[]).map((p) => (
            <button key={p} type="button" aria-pressed={pm === p} onClick={() => setPm(p)}>
              {p === 'pm25' ? 'PM2.5' : 'PM10'}
            </button>
          ))}
        </div>
      </div>

      <ul className="fc-legend" aria-hidden="true">
        <li>
          <span className="fc-key fc-key-line" />
          {labels.ours}
        </li>
        {hasBand && (
          <li>
            <span className="fc-key fc-key-band" />
            {labels.band}
          </li>
        )}
        {hasCams && (
          <li>
            <span className="fc-key fc-key-cams" />
            {labels.cams}
          </li>
        )}
      </ul>

      <div
        className="chart"
        ref={box}
        tabIndex={0}
        role="group"
        aria-label={labels.alt.replace('{pm}', pmName)}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true">
          <defs>
            <clipPath id={clip}>
              <rect x={M.left} y={M.top} width={innerW} height={innerH} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clip})`}>
            {stripes.map((s) => (
              <rect
                key={s.level}
                x={M.left}
                width={innerW}
                y={y(Math.min(s.hi, yMax))}
                height={Math.max(y(s.lo) - y(Math.min(s.hi, yMax)), 0)}
                fill={LEVEL_COLORS[s.level]}
                opacity={0.1}
              />
            ))}
          </g>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="grid-line" x1={M.left} x2={width - M.right} y1={y(tick)} y2={y(tick)} />
              <text x={M.left - 8} y={y(tick) + 4} textAnchor="end">
                {fmt(tick)}
              </text>
            </g>
          ))}
          {hours.map((hr, i) =>
            hr === 0 && i > 0 ? <line key={`d${i}`} className="fc-midnight" x1={x(i)} x2={x(i)} y1={M.top} y2={HEIGHT - M.bottom} /> : null,
          )}
          {hours.map((hr, i) =>
            hr % step === 0 && x(i) - x(0) > 44 && i < hourly.length - 2 ? (
              <text key={`h${i}`} x={x(i)} y={HEIGHT - 8} textAnchor="middle">
                {hr === 0 ? hourLabel(lang, hourly[i]!.t).split(' ')[0] : `${String(hr).padStart(2, '0')}:00`}
              </text>
            ) : null,
          )}
          <text x={x(0)} y={HEIGHT - 8} textAnchor="start" className="fc-now-label">
            {labels.now}
          </text>

          {band && <path className="fc-band" d={band} />}
          {cams && <path className="fc-cams" d={cams} />}
          <path className="series" d={line} />
          <line className="fc-cursor" x1={x(active)} x2={x(active)} y1={M.top} y2={HEIGHT - M.bottom} />
          <circle className="dot is-active" cx={x(active)} cy={y(value(current))} r={5.5} />
        </svg>

        <div className="tooltip" style={{ left: Math.min(Math.max(x(active), 70), width - 70), top: y(value(current)) }}>
          <strong>
            {fmt(value(current))} <small>µg/m³</small>
          </strong>
          <span>{hourLabel(lang, current.t)}</span>
          {hasCams && (
            <span>
              CAMS {fmt(current.cams_pm25!)}
            </span>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {readout}
        </p>
      </div>

      <details className="data-table">
        <summary>{labels.table}</summary>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{labels.hour}</th>
                <th scope="col">PM2.5</th>
                <th scope="col">PM10</th>
                <th scope="col">CAMS PM2.5</th>
              </tr>
            </thead>
            <tbody>
              {hourly.map((h) => (
                <tr key={h.t}>
                  <th scope="row">{hourLabel(lang, h.t)}</th>
                  <td>{fmt(h.pm25)}</td>
                  <td>{fmt(h.pm10)}</td>
                  <td>{h.cams_pm25 != null ? fmt(h.cams_pm25) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
