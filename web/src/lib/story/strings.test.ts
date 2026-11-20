import { describe, expect, it } from 'vitest';
import { STORY_BG, STORY_EN, fmtNum, story } from './strings';

describe('story strings', () => {
  it('has an EN string for every BG key and no empty strings', () => {
    expect(Object.keys(STORY_EN).sort()).toEqual(Object.keys(STORY_BG).sort());
    for (const v of [...Object.values(STORY_BG), ...Object.values(STORY_EN)]) expect(v.trim()).not.toBe('');
  });

  it('fills variables', () => {
    expect(story('bg', 'ch4.stat', { hits: 18, bad: 23 })).toBe('18 от 23 лоши дни');
    expect(story('en', 'ch4.stat', { hits: 18, bad: 23 })).toBe('18 of 23 bad days');
  });

  it('formats numbers per language', () => {
    expect(fmtNum('bg', 3.2, 1)).toBe('3,2');
    expect(fmtNum('en', 3.2, 1)).toBe('3.2');
    expect(fmtNum('bg', 555)).toBe('555');
    expect(fmtNum('en', 68.9, 1)).toBe('68.9');
  });

  it('formats millions per language', () => {
    expect(fmtNum('bg', 5_277_731, 2, 'millions')).toBe('5,28 млн.');
    expect(fmtNum('en', 5_277_731, 2, 'millions')).toBe('5.28M');
  });
});
