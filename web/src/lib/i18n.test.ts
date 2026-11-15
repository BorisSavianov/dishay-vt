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
    expect(t('en', 'stat.population.label', { year: 2025 })).toBe('Population in 2025');
  });
});
