import { describe, expect, it } from 'vitest';
import { OTHER, toNumber } from './preprocess';
import type { FeatureSpec } from './types';
import { MAX_ROWS, validateRequest } from './validate';

const features: FeatureSpec[] = [
  { name: 'area', type: 'number', required: true, impute: 50, min: 10, max: 200 },
  { name: 'rooms', type: 'number', required: false, impute: 2, min: 1, max: 6 },
  { name: 'district', type: 'category', required: false, impute: 'center', categories: ['center', 'north', OTHER] },
];

describe('toNumber', () => {
  it('reads numbers typed into a phone form', () => {
    expect(toNumber('12,5')).toBe(12.5);
    expect(toNumber(' 1 200 ')).toBe(1200);
    expect(toNumber('3.25')).toBe(3.25);
    expect(toNumber('12abc')).toBeNull();
    expect(toNumber('')).toBeNull();
  });
});

describe('validateRequest', () => {
  it('accepts a single row, parses numeric text and imputes what is missing', () => {
    const v = validateRequest(features, { inputs: { area: '72,5' } });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.rows).toEqual([{ area: 72.5, rooms: 2, district: 'center' }]);
    expect(v.warnings.map((w) => w.field)).toEqual(['rooms', 'district']);
  });

  it('maps an unseen category to the other bucket with a warning, not an error', () => {
    const v = validateRequest(features, { inputs: [{ area: 80, district: 'Lyulin' }] });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.rows[0]!.district).toBe(OTHER);
    expect(v.warnings.some((w) => w.field === 'district' && w.issue.includes('unseen'))).toBe(true);
  });

  it('rejects a body without inputs', () => {
    expect(validateRequest(features, { area: 1 }).ok).toBe(false);
    expect(validateRequest(features, null).ok).toBe(false);
  });

  it(`rejects an empty list and more than ${MAX_ROWS} rows`, () => {
    expect(validateRequest(features, { inputs: [] }).ok).toBe(false);
    const many = Array.from({ length: MAX_ROWS + 1 }, () => ({ area: 1 }));
    expect(validateRequest(features, { inputs: many }).ok).toBe(false);
  });

  it('names the row and field of every problem', () => {
    const v = validateRequest(features, { inputs: [{ area: 1 }, 'x', { rooms: 'many', colour: 'red' }] });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.details).toEqual(
      expect.arrayContaining([
        { row: 1, issue: 'row must be an object of feature values' },
        { row: 2, field: 'colour', issue: 'unknown feature' },
        { row: 2, field: 'area', issue: 'required' },
        { row: 2, field: 'rooms', issue: 'expected a number' },
      ]),
    );
  });

  it('rejects booleans and objects where a number is expected', () => {
    expect(validateRequest(features, { inputs: { area: true } }).ok).toBe(false);
    expect(validateRequest(features, { inputs: { area: { v: 1 } } }).ok).toBe(false);
  });
});
