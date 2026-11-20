import { describe, expect, it } from 'vitest';
import type { Level } from '@/lib/aq/levels';
import { backdropPoster, formatCount, nowSkyMode, parseCount, smogForLevel } from './look';

describe('smogForLevel', () => {
  it('maps the six levels', () =>
    expect([1, 2, 3, 4, 5, 6].map((l) => smogForLevel(l as Level))).toEqual([0, 0.15, 0.35, 0.6, 0.8, 1]));
  it('is clear with no level', () => expect(smogForLevel(null)).toBe(0));
});

describe('backdropPoster', () => {
  it('maps pages to chapters at dusk', () => {
    expect(backdropPoster('why', 'dark')).toBe('/story/ch6.webp');
    expect(backdropPoster('ai', 'dark')).toBe('/story/ch5.webp');
    expect(backdropPoster('sources', 'dark')).toBe('/story/ch3.webp');
    expect(backdropPoster('about', 'dark')).toBe('/story/ch1.webp');
    expect(backdropPoster('health', 'dark')).toBe('/story/ch1.webp');
    expect(backdropPoster('predict', 'dark')).toBe('/story/ch4.webp');
  });
  it('uses daylight in day', () => expect(backdropPoster('why', 'light')).toBe('/story/ch7.webp'));
  it('has no poster on the map and the dashboard', () => {
    expect(backdropPoster('geo', 'dark')).toBeNull();
    expect(backdropPoster('dashboard', 'dark')).toBeNull();
    expect(backdropPoster('geo', 'light')).toBeNull();
  });
});

describe('nowSkyMode', () => {
  const desk = { webgl2: true, reducedMotion: false, width: 1440, cores: 10, memoryGb: 16 };
  it('runs high on a desktop', () => expect(nowSkyMode(desk)).toBe('webgl-high'));
  it('runs low on 4 cores', () => expect(nowSkyMode({ ...desk, cores: 4 })).toBe('webgl-low'));
  it('shows the poster on a phone', () => expect(nowSkyMode({ ...desk, width: 390 })).toBe('poster'));
  it('shows the poster with reduced motion', () => expect(nowSkyMode({ ...desk, reducedMotion: true })).toBe('poster'));
  it('shows the poster without WebGL2', () => expect(nowSkyMode({ ...desk, webgl2: false })).toBe('poster'));
});

describe('parseCount', () => {
  it('reads a BG decimal', () => expect(parseCount('6,4')).toMatchObject({ value: 6.4, decimals: 1, decimalSep: ',' }));
  it('reads an EN decimal', () => expect(parseCount('6.4')).toMatchObject({ value: 6.4, decimals: 1, decimalSep: '.' }));
  it('keeps prefix and suffix', () =>
    expect(parseCount('±12 µg/m³')).toMatchObject({ value: 12, decimals: 0, prefix: '±', suffix: ' µg/m³' }));
  it('round-trips', () => {
    const s = parseCount('6,4')!;
    expect(formatCount(s, 6.4)).toBe('6,4');
    expect(formatCount(s, 0)).toBe('0,0');
    expect(formatCount(parseCount('±12 µg/m³')!, 3.6)).toBe('±4 µg/m³');
  });
  it('refuses text with two numbers', () => expect(parseCount('6 и 7')).toBeNull());
  it('refuses text with no number', () => expect(parseCount('—')).toBeNull());
});
