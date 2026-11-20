import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { palettes, type ColorToken, type Mode, type PointType } from './palette';

// The colours must match web/src/app/globals.css. The :root block is light ("day") and
// :root[data-theme='dark'] ("dusk", the default) overrides it, so the dark set is the light set with those overrides on top.
// Only hex values are compared. npm test runs from the mobile/ folder, next to web/.
const css = readFileSync(resolve(process.cwd(), '../web/src/app/globals.css'), 'utf8');

const LIGHT_BLOCK = /(?:^|\n):root\s*\{([^}]*)\}/;
const DARK_BLOCK = /:root\[data-theme='dark'\]\s*\{([^}]*)\}/;

// Web token name -> mobile palette token.
const WEB_TO_APP: Array<[string, ColorToken]> = [
  ['bg', 'bg'],
  ['surface', 'card'],
  ['surface-2', 'card2'],
  ['fg', 'fg'],
  ['muted', 'muted'],
  ['line', 'line'],
  ['grid', 'grid'],
  ['accent', 'accent'],
  ['accent-strong', 'accentStrong'],
  ['accent-soft', 'accentSoft'],
  ['on-accent', 'onAccent'],
  ['neg', 'neg'],
  ['neg-soft', 'negSoft'],
  ['pos', 'pos'],
  ['pos-soft', 'posSoft'],
  ['warn', 'warn'],
  ['warm', 'warm'],
  ['sky-top', 'skyTop'],
  ['sky-horizon', 'skyHorizon'],
];

// Translucent tokens, compared as rgba() with the spaces taken out.
const WEB_TO_RGBA: Array<[string, ColorToken]> = [
  ['glass', 'glass'],
  ['glass-edge', 'glassEdge'],
  ['glow', 'glow'],
];

const WEB_TO_POINT: Array<[string, PointType]> = [
  ['t-pharmacy', 'pharmacy'],
  ['t-hospital', 'hospital'],
  ['t-clinic', 'clinic'],
  ['t-doctors', 'doctors'],
  ['t-bus-stop', 'bus_stop'],
];

function hexTokensIn(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[m[1]!] = m[2]!.toLowerCase();
  }
  return out;
}

function rgbaTokensIn(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(rgba\([^)]*\))/g)) {
    out[m[1]!] = m[2]!.replace(/\s+/g, '');
  }
  return out;
}

// --title-grad: linear-gradient(180deg, <top> <stop>%, <bottom> 100%)
function titleGradIn(block: string): { top: string; stop: number; bottom: string } | null {
  const m = /--title-grad:\s*linear-gradient\(\s*180deg,\s*(#[0-9a-fA-F]{6})\s+(\d+)%,\s*(#[0-9a-fA-F]{6})\s+100%\s*\)/.exec(block);
  return m ? { top: m[1]!.toLowerCase(), stop: Number(m[2]) / 100, bottom: m[3]!.toLowerCase() } : null;
}

const lightBlock = LIGHT_BLOCK.exec(css)?.[1] ?? '';
const darkBlock = DARK_BLOCK.exec(css)?.[1] ?? '';
const light = hexTokensIn(lightBlock);
const dark = { ...light, ...hexTokensIn(darkBlock) };
const web: Record<Mode, Record<string, string>> = { light, dark };
const lightRgba = rgbaTokensIn(lightBlock);
const webRgba: Record<Mode, Record<string, string>> = { light: lightRgba, dark: { ...lightRgba, ...rgbaTokensIn(darkBlock) } };
const webTitle: Record<Mode, ReturnType<typeof titleGradIn>> = {
  light: titleGradIn(lightBlock),
  dark: titleGradIn(darkBlock) ?? titleGradIn(lightBlock),
};

describe('mobile palette matches web/src/app/globals.css', () => {
  for (const mode of ['light', 'dark'] as Mode[]) {
    it(`${mode}: the web blocks parsed`, () => {
      assert.ok(Object.keys(web[mode]).length >= 20, `web ${mode} parsed ${Object.keys(web[mode]).length} hex tokens`);
    });

    it(`${mode}: every colour token equals the web value`, () => {
      for (const [webName, appName] of WEB_TO_APP) {
        assert.equal(palettes[mode][appName], web[mode][webName], `${mode} --${webName} -> ${appName}`);
      }
    });

    it(`${mode}: every translucent token equals the web value`, () => {
      for (const [webName, appName] of WEB_TO_RGBA) {
        assert.equal(palettes[mode][appName].replace(/\s+/g, ''), webRgba[mode][webName], `${mode} --${webName} -> ${appName}`);
      }
    });

    it(`${mode}: the title gradient equals the web --title-grad`, () => {
      const g = webTitle[mode];
      assert.ok(g, `web ${mode} --title-grad parsed`);
      assert.equal(palettes[mode].titleTop, g.top);
      assert.equal(palettes[mode].titleBottom, g.bottom);
      assert.equal(palettes[mode].titleStop, g.stop);
    });

    it(`${mode}: every facility type colour equals the web value`, () => {
      for (const [webName, type] of WEB_TO_POINT) {
        assert.equal(palettes[mode].points[type], web[mode][webName], `${mode} --${webName} -> points.${type}`);
      }
    });
  }
});
