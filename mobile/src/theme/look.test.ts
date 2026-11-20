import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { backdropPoster, COUNT_MS, countAt, smogForLevel } from './look';

describe('look', () => {
  it('maps air levels to haze like the web /now valley', () => {
    const web = readFileSync(resolve(process.cwd(), '../web/src/lib/look.ts'), 'utf8');
    const m = /const SMOG[^=]*=\s*\{([^}]*)\}/.exec(web);
    assert.ok(m, 'web SMOG parsed');
    for (const pair of m[1]!.matchAll(/(\d):\s*([\d.]+)/g)) {
      assert.equal(smogForLevel(Number(pair[1]) as 1), Number(pair[2]), `level ${pair[1]}`);
    }
    assert.equal(smogForLevel(null), 0);
  });

  it('gives the map no poster, the rest the dusk valley, and day the daylight still', () => {
    assert.equal(backdropPoster('map', 'dark'), null);
    assert.equal(backdropPoster('air', 'dark'), 'ch1');
    assert.equal(backdropPoster('health', 'light'), 'ch7');
  });

  it('counts up from 0 to the exact value and stays there', () => {
    assert.equal(countAt(42, 0), 0);
    assert.ok(countAt(42, COUNT_MS / 2) > 21, 'eases out');
    assert.equal(countAt(42, COUNT_MS), 42);
    assert.equal(countAt(42, COUNT_MS * 3), 42);
    assert.equal(countAt(3.7, COUNT_MS, 1), 3.7);
  });
});
