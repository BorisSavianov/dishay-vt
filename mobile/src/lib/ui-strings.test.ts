import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ui, type UiKey } from './ui-strings';

const KEYS: UiKey[] = ['mode.toggle', 'mode.light', 'mode.dark', 'chart.hint'];

describe('mobile UI strings', () => {
  it('has a non-empty Bulgarian and English value for every key', () => {
    for (const key of KEYS) {
      assert.ok(ui('bg', key).length > 0, `bg ${key}`);
      assert.ok(ui('en', key).length > 0, `en ${key}`);
    }
  });

  it('gives Bulgarian and English different text, so the switch is visible', () => {
    assert.notEqual(ui('bg', 'mode.toggle'), ui('en', 'mode.toggle'));
  });

  it('fills named variables', () => {
    assert.equal(ui('en', 'mode.toggle', { x: 1 }), 'Colour theme');
  });
});
