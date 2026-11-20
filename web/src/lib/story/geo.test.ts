import { describe, expect, it } from 'vitest';
import { decodeTerrarium, toBg, toScene, type TerrainMeta } from './geo';

const T: TerrainMeta = { west: 25.5, east: 25.7, south: 43.0, north: 43.2, minM: 100, maxM: 500, size: 1024 };

describe('decodeTerrarium', () => {
  it('decodes sea level and 200 m', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(128, 200, 0)).toBe(200);
  });
});

describe('toScene', () => {
  it('maps the centre to the origin', () => {
    const [x, z] = toScene(43.1, 25.6, T);
    expect(x).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
  });

  it('maps the north-west corner to [-10, -10]', () => {
    expect(toScene(43.2, 25.5, T)).toEqual([-10, -10]);
  });

  it('maps the south-east corner to [10, 10] for a custom size', () => {
    expect(toScene(43.0, 25.7, T, 4)).toEqual([2, 2]);
  });
});

describe('toBg', () => {
  it('puts central Bulgaria near the origin', () => {
    const [x, z] = toBg(42.75, 25.5);
    expect(Math.abs(x)).toBeLessThan(1);
    expect(Math.abs(z)).toBeLessThan(1);
  });

  it('puts Sofia west and Varna east, Ruse north of Kardzhali', () => {
    expect(toBg(42.7, 23.32)[0]).toBeLessThan(0);
    expect(toBg(43.21, 27.91)[0]).toBeGreaterThan(0);
    expect(toBg(43.85, 25.97)[1]).toBeLessThan(toBg(41.64, 25.37)[1]);
  });

  it('keeps Bulgaria within x ∈ [-20, 20]', () => {
    expect(toBg(42.0, 22.4)[0]).toBeGreaterThanOrEqual(-20);
    expect(toBg(43.5, 28.6)[0]).toBeLessThanOrEqual(20);
  });
});
