'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { labelStride, linePath, nearestIndex, niceTicks } from '@/lib/chart';
import { fmtCompact, fmtInt, fmtNum } from '@/lib/format';
import type { Lang } from '@/lib/types';

type Mode = 'line' | 'area' | 'bar';

export type TrendLabels = {
  title: string;
  subtitle: string;
  type: string;
  line: string;
  area: string;
  bar: string;
  alt: string;
  table: string;
  year: string;
  readout: string; // already filled with {label}; still has {year} and {value}
  valueLabel: string;
};

const HEIGHT = 280;
const M = { top: 16, right: 16, bottom: 30, left: 52 };

// A population-style trend chart in plain SVG: Line, Area or Bar, a hover/keyboard readout, and the same
// values as a table underneath. Bars start at zero; line and area use a padded range so the trend is visible.
export function TrendChart({
  series,
  lang,
  labels,
  digits = 0,
}: {
  series: { year: number; value: number }[];
  lang: Lang;
  labels: TrendLabels;
  digits?: number;
}) {
  const [mode, setMode] = useState<Mode>('line');
  const [active, setActive] = useState(series.length - 1);
  const [width, setWidth] = useState(640);
  const box = useRef<HTMLDivElement>(null);
  const gradient = useId();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fmt = (n: number) => (digits === 0 ? fmtInt(lang, n) : fmtNum(lang, n, digits));
  const values = series.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const ticks = niceTicks(mode === 'bar' ? 0 : lo, hi, 5);
  const yMin = ticks[0] ?? 0;
  const yMax = ticks[ticks.length - 1] ?? 1;
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const y = (v: number) => M.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const band = innerW / Math.max(series.length, 1);
  const xs = series.map((_, i) =>
    mode === 'bar' ? M.left + band * i + band / 2 : M.left + (series.length === 1 ? innerW / 2 : (innerW * i) / (series.length - 1)),
  );
  const pts = series.map((p, i) => ({ x: xs[i]!, y: y(p.value) }));
  const stride = labelStride(series.length, innerW, 44);
  const current = series[active] ?? series[series.length - 1]!;
  const currentPt = pts[active] ?? pts[pts.length - 1]!;
  const baseY = y(yMin);
  const tickFmt = (n: number) => (digits === 0 ? fmtCompact(lang, n) : fmtNum(lang, n, digits));

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(xs, e.clientX - rect.left));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = series.length - 1;
    const next =
      e.key === 'ArrowLeft' ? active - 1 : e.key === 'ArrowRight' ? active + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(Math.min(Math.max(next, 0), last));
  }

  const readout = labels.readout.replace('{year}', String(current.year)).replace('{value}', fmt(current.value));
  const modes: [Mode, string][] = [
    ['line', labels.line],
    ['area', labels.area],
    ['bar', labels.bar],
  ];

  return (
    <div>
      <div className="card-head">
        <div>
          <h2 className="card-title">{labels.title}</h2>
          <p className="card-sub">{labels.subtitle}</p>
        </div>
        <div className="seg" role="group" aria-label={labels.type}>
          {modes.map(([m, text]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {text}
            </button>
          ))}
        </div>
      </div>

      <div
        className="chart"
        ref={box}
        tabIndex={0}
        role="group"
        aria-label={labels.alt}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(series.length - 1)}
        onKeyDown={onKeyDown}
      >
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true">
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="grid-line" x1={M.left} x2={width - M.right} y1={y(tick)} y2={y(tick)} />
              <text x={M.left - 10} y={y(tick) + 4} textAnchor="end">
                {tickFmt(tick)}
              </text>
            </g>
          ))}
          {series.map((p, i) =>
            (i % stride === 0 && series.length - 1 - i >= stride) || i === series.length - 1 ? (
              <text key={p.year} x={xs[i]} y={HEIGHT - 8} textAnchor="middle">
                {p.year}
              </text>
            ) : null,
          )}

          {mode === 'bar' &&
            series.map((p, i) => {
              const w = Math.max(Math.min(band * 0.62, 44), 4);
              return (
                <rect
                  key={p.year}
                  className={`bar${i === active ? ' is-active' : ''}`}
                  x={xs[i]! - w / 2}
                  y={y(p.value)}
                  width={w}
                  height={Math.max(baseY - y(p.value), 1)}
                  rx={4}
                />
              );
            })}

          {mode === 'area' && pts.length > 1 && (
            <path d={`${linePath(pts)} L${pts[pts.length - 1]!.x.toFixed(2)} ${baseY} L${pts[0]!.x.toFixed(2)} ${baseY} Z`} fill={`url(#${gradient})`} />
          )}
          {mode !== 'bar' && <path className="series" d={linePath(pts)} />}
          {mode !== 'bar' &&
            pts.map((p, i) => <circle key={series[i]!.year} className={`dot${i === active ? ' is-active' : ''}`} cx={p.x} cy={p.y} r={i === active ? 6 : 3.5} />)}
        </svg>

        <div className="tooltip" style={{ left: Math.min(Math.max(currentPt.x, 48), width - 48), top: currentPt.y }}>
          <strong>{fmt(current.value)}</strong>
          <span>{current.year}</span>
        </div>
        <p className="sr-only" aria-live="polite">
          {readout}
        </p>
      </div>

      <details className="data-table">
        <summary>{labels.table}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{labels.year}</th>
              <th scope="col">{labels.valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.year}>
                <th scope="row">{p.year}</th>
                <td>{fmt(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
