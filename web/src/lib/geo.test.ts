import { describe, expect, it } from 'vitest';
import { boundsOf, outerRings, projectToUnit, ringContains } from './geo';
import { bundled, bundledRegion } from './data';

describe('projectToUnit', () => {
  it('returns nothing for no points', () => {
    expect(projectToUnit([])).toEqual([]);
  });

  it('keeps every point inside the unit box and fills the longer side', () => {
    const pts = projectToUnit(bundled.facilities.points);
    expect(pts).toHaveLength(bundled.facilities.points.length);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    for (const v of [...xs, ...ys]) {
      expect(v).toBeGreaterThanOrEqual(-0.5 - 1e-9);
      expect(v).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    const longest = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    expect(longest).toBeCloseTo(1, 6);
  });

  it('puts north at the top', () => {
    const [south, north] = projectToUnit([
      { lat: 43.0, lon: 25.6 },
      { lat: 43.4, lon: 25.6 },
    ]);
    expect(north!.y).toBeGreaterThan(south!.y);
  });
});

describe('boundsOf', () => {
  it('returns null for no points and the extremes otherwise', () => {
    expect(boundsOf([])).toBeNull();
    expect(
      boundsOf([
        { lat: 43.0, lon: 25.9 },
        { lat: 43.4, lon: 25.5 },
      ]),
    ).toEqual({ minLat: 43.0, maxLat: 43.4, minLon: 25.5, maxLon: 25.9 });
  });
});

describe('ringContains', () => {
  const square = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [0, 0],
  ];
  it('tells inside from outside', () => {
    expect(ringContains(square, 2, 2)).toBe(true);
    expect(ringContains(square, 5, 2)).toBe(false);
    expect(ringContains(square, 2, -1)).toBe(false);
  });
});

describe('the bundled province boundary', () => {
  const rings = outerRings(bundledRegion.geometry);

  it('is one closed ring', () => {
    expect(rings).toHaveLength(1);
    expect(rings[0]![0]).toEqual(rings[0]!.at(-1));
    expect(rings[0]!.length).toBeGreaterThan(100);
  });

  it('holds every facility, as the pipeline check says', () => {
    const inside = bundled.facilities.points.filter((p) => rings.some((r) => ringContains(r, p.lon, p.lat)));
    expect(inside).toHaveLength(bundled.facilities.points.length);
    expect(bundledRegion.check).toEqual({ points: bundled.facilities.points.length, inside: inside.length });
  });

  it('does not contain a point far outside the province', () => {
    expect(rings.some((r) => ringContains(r, 23.3, 42.7))).toBe(false); // Sofia
  });
});
