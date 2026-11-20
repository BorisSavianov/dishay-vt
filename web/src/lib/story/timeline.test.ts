import { describe, expect, it } from 'vitest';
import { CHAPTERS, KEYFRAMES, chapterOf, chapterTarget, progressFromSections, progressOf, sceneAt } from './timeline';

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('sceneAt', () => {
  it('starts at the first keyframe and ends clear', () => {
    expect(sceneAt(0)).toEqual(KEYFRAMES[0]!.s);
    expect(sceneAt(1).clear).toBe(1);
    expect(sceneAt(1).smog).toBe(0);
  });

  it('has one keyframe per chapter start plus the end', () => {
    expect(KEYFRAMES.map((k) => k.p)).toEqual([...Array.from({ length: CHAPTERS }, (_, i) => i / CHAPTERS), 1]);
  });

  it('moves the camera continuously', () => {
    for (let i = 0; i < 200; i++) {
      expect(dist(sceneAt(i / 200).cam, sceneAt((i + 1) / 200).cam)).toBeLessThan(3);
    }
  });

  it('clamps out-of-range progress', () => {
    expect(sceneAt(-0.5)).toEqual(sceneAt(0));
    expect(sceneAt(1.5)).toEqual(sceneAt(1));
  });

  it('runs the episode clock through chapter 2', () => {
    expect(sceneAt(1 / 8).episodeHour).toBe(0);
    const mid = sceneAt(1 / 8 + 0.5 / 8).episodeHour;
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(13);
    let last = -1;
    for (let i = 0; i <= 20; i++) {
      const h = sceneAt(1 / 8 + (i / 20) * (1 / 8)).episodeHour;
      expect(h).toBeGreaterThanOrEqual(last);
      last = h;
    }
    expect(sceneAt(2 / 8).episodeHour).toBe(23);
  });

  it('shows the sensors over Bulgaria in chapter 3, bars in 5, streams in 6', () => {
    expect(sceneAt(2.5 / 8).sensorsBg).toBeGreaterThan(0.9);
    expect(sceneAt(4.5 / 8).bars).toBe(1);
    expect(sceneAt(5.5 / 8).streams).toBe(1);
    expect(sceneAt(6.5 / 8).bars).toBe(0);
    expect(sceneAt(6.5 / 8).streams).toBe(0);
  });

  it('holds each chapter state in the middle of its span', () => {
    for (let n = 1; n <= CHAPTERS; n++) {
      expect(sceneAt((n - 0.5) / CHAPTERS)).toEqual({ ...KEYFRAMES[n - 1]!.s, episodeHour: sceneAt((n - 0.5) / CHAPTERS).episodeHour });
    }
  });
});

describe('progressOf', () => {
  it('centres chapter n of a page of 8 viewport-high sections', () => {
    expect(progressOf(0, 1000)).toBeCloseTo(0.5 / 8, 6);
    expect(progressOf(1000, 1000)).toBeCloseTo(1.5 / 8, 6);
    expect(progressOf(7000, 1000)).toBeCloseTo(7.5 / 8, 6);
    expect(chapterOf(progressOf(3000, 1000))).toBe(4);
  });

  it('follows real section heights when cards make some sections taller', () => {
    const tops = [0, 800, 2400, 3200, 4000, 4800, 5600, 6400];
    expect(chapterOf(progressFromSections(2000, tops, 7200))).toBe(2);
    expect(progressFromSections(1600, tops, 7200)).toBeCloseTo(1.5 / 8, 6);
    expect(progressFromSections(-10, tops, 7200)).toBe(0);
    expect(progressFromSections(9999, tops, 7200)).toBe(1);
  });
});

describe('chapterOf', () => {
  it('maps progress to chapters 1..8', () => {
    expect(chapterOf(0)).toBe(1);
    expect(chapterOf(0.13)).toBe(2);
    expect(chapterOf(0.999)).toBe(8);
    expect(chapterOf(1)).toBe(8);
  });
});

describe('chapterTarget', () => {
  it('steps forward and back', () => {
    expect(chapterTarget(3, ' ', false)).toBe(4);
    expect(chapterTarget(3, 'PageDown', false)).toBe(4);
    expect(chapterTarget(3, 'ArrowDown', false)).toBe(4);
    expect(chapterTarget(3, 'PageUp', false)).toBe(2);
    expect(chapterTarget(3, 'ArrowUp', false)).toBe(2);
    expect(chapterTarget(3, ' ', true)).toBe(2);
  });

  it('jumps to the ends', () => {
    expect(chapterTarget(5, 'Home', false)).toBe(1);
    expect(chapterTarget(5, 'End', false)).toBe(8);
  });

  it('does nothing past the ends or for other keys', () => {
    expect(chapterTarget(8, 'ArrowDown', false)).toBeNull();
    expect(chapterTarget(8, 'End', false)).toBeNull();
    expect(chapterTarget(1, 'ArrowUp', false)).toBeNull();
    expect(chapterTarget(1, ' ', true)).toBeNull();
    expect(chapterTarget(1, 'Home', false)).toBeNull();
    expect(chapterTarget(5, 'a', false)).toBeNull();
  });
});
