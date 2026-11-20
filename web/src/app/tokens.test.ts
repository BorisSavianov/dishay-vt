import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DUSK_BG } from '@/lib/theme';

// Reads the two token blocks of globals.css: day is :root, dusk is :root plus :root[data-theme='dark'].
const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

function tokens(theme: 'light' | 'dark'): Record<string, string> {
  const day = block(':root');
  return theme === 'light' ? day : { ...day, ...block(":root[data-theme='dark']") };
}

type RGBA = [number, number, number, number];

function rgba(c: string): RGBA {
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const fn = c.match(/^rgba?\(([^)]+)\)$/);
  if (!fn) throw new Error(`not a colour: ${c}`);
  const [r, g, b, a = '1'] = fn[1]!.split(',').map((s) => s.trim());
  return [Number(r), Number(g), Number(b), Number(a)];
}

function over(top: string, base: string): RGBA {
  const [r, g, b, a] = rgba(top);
  const [R, G, B] = rgba(base);
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
}

function luminance([r, g, b]: RGBA): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(fg: string, bg: RGBA): number {
  const a = luminance(rgba(fg));
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('theme tokens', () => {
  it.each(['light', 'dark'] as const)('%s: body text on glass and on the opaque fallback is AA', (theme) => {
    const t = tokens(theme);
    for (const surface of [over(t['--glass']!, t['--bg']!), rgba(t['--glass-solid']!)]) {
      expect(contrast(t['--fg']!, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['--muted']!, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('the dusk background matches the theme-color', () => expect(tokens('dark')['--bg']).toBe(DUSK_BG));
});
