import { describe, expect, it } from 'vitest';
import { messages, t } from './i18n';

describe('i18n', () => {
  it('has the same keys in Bulgarian and English', () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.bg).sort());
  });

  it('has no empty strings', () => {
    for (const lang of ['bg', 'en'] as const) {
      for (const [key, value] of Object.entries(messages[lang])) {
        expect(value.trim(), `${lang}:${key}`).not.toBe('');
      }
    }
  });

  it('fills in variables', () => {
    expect(t('en', 'kpi.population.label', { year: 2025 })).toBe('Population (2025)');
  });

  it('uses the same {variables} in both languages for every key', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(messages.bg) as (keyof typeof messages.bg)[]) {
      expect(vars(messages.en[key]), key).toEqual(vars(messages.bg[key]));
    }
  });
});
