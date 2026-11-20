import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { palettes, type ColorToken, type Mode, type PointType } from './palette';

// The colours must match web/src/app/globals.css. The :root block is light (the default) and
// :root[data-theme='dark'] overrides it, so the dark set is the light set with those overrides on top.
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

const light = hexTokensIn(LIGHT_BLOCK.exec(css)?.[1] ?? '');
const dark = { ...light, ...hexTokensIn(DARK_BLOCK.exec(css)?.[1] ?? '') };
const web: Record<Mode, Record<string, string>> = { light, dark };

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

    it(`${mode}: every facility type colour equals the web value`, () => {
      for (const [webName, type] of WEB_TO_POINT) {
        assert.equal(palettes[mode].points[type], web[mode][webName], `${mode} --${webName} -> points.${type}`);
      }
    });
  }
});
