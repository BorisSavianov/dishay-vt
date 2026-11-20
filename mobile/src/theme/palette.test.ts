import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { palettes, type ColorToken, type Mode, type PointType } from './palette';
import { contrastRatio } from './contrast';

const MODES: Mode[] = ['light', 'dark'];
const TEXT_TOKENS: ColorToken[] = ['fg', 'muted', 'accentStrong', 'warn'];
const SURFACES: ColorToken[] = ['bg', 'card'];
const POINT_TYPES: PointType[] = ['pharmacy', 'hospital', 'clinic', 'doctors', 'bus_stop'];

describe('palette contrast (WCAG 2.x)', () => {
  for (const mode of MODES) {
    const p = palettes[mode];

    for (const token of TEXT_TOKENS) {
      for (const surface of SURFACES) {
        it(`${mode}: ${token} text on ${surface} is at least 4.5:1`, () => {
          const ratio = contrastRatio(p[token], p[surface]);
          assert.ok(ratio >= 4.5, `${token} ${p[token]} on ${surface} ${p[surface]} = ${ratio.toFixed(2)}`);
        });
      }
    }

    it(`${mode}: onAccent text on accent is at least 4.5:1`, () => {
      const ratio = contrastRatio(p.onAccent, p.accent);
      assert.ok(ratio >= 4.5, `onAccent on accent = ${ratio.toFixed(2)}`);
    });

    it(`${mode}: accent is at least 3:1 against the surfaces (graphics)`, () => {
      for (const surface of SURFACES) {
        const ratio = contrastRatio(p.accent, p[surface]);
        assert.ok(ratio >= 3, `accent on ${surface} = ${ratio.toFixed(2)}`);
      }
    });

    it(`${mode}: delta text is at least 4.5:1 on its soft background`, () => {
      assert.ok(contrastRatio(p.neg, p.negSoft) >= 4.5, 'neg on negSoft');
      assert.ok(contrastRatio(p.pos, p.posSoft) >= 4.5, 'pos on posSoft');
      assert.ok(contrastRatio(p.accentStrong, p.accentSoft) >= 4.5, 'accentStrong on accentSoft');
    });

    for (const type of POINT_TYPES) {
      for (const surface of SURFACES) {
        it(`${mode}: ${type} point is at least 3:1 against ${surface} (graphics)`, () => {
          const ratio = contrastRatio(p.points[type], p[surface]);
          assert.ok(ratio >= 3, `${type} ${p.points[type]} on ${surface} = ${ratio.toFixed(2)}`);
        });
      }
    }
  }
});
