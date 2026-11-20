import { describe, expect, it } from 'vitest';
import { bundled } from './data';
import { insightText } from './insight';

describe('insightText', () => {
  it('describes the Veliko Tarnovo decline in English', () => {
    expect(insightText('en', bundled.population.series)).toBe(
      'The population decreased by 16.0% between 2015 and 2025. It fell in every year of the period.',
    );
  });

  it('describes it in Bulgarian with the same figures', () => {
    const text = insightText('bg', bundled.population.series)!;
    expect(text).toContain('2015');
    expect(text).toContain('2025');
    expect(text).toContain('16,0%');
  });

  it('says nothing for a series that cannot be compared', () => {
    expect(insightText('en', [])).toBeNull();
    expect(insightText('en', [{ year: 2020, value: 5 }])).toBeNull();
    expect(insightText('en', [{ year: 2020, value: 0 }, { year: 2021, value: 5 }])).toBeNull();
  });

  it('drops the every-year sentence for a mixed series and handles a rise', () => {
    const mixed = [{ year: 2020, value: 10 }, { year: 2021, value: 8 }, { year: 2022, value: 12 }];
    expect(insightText('en', mixed)).toBe('The population increased by 20.0% between 2020 and 2022.');
    expect(insightText('en', [{ year: 2020, value: 10 }, { year: 2021, value: 10 }])).toBe(
      'The population did not change between 2020 and 2021.',
    );
  });
});
