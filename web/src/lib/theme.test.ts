import { describe, expect, it } from 'vitest';
import { THEME_SCRIPT } from './theme';

// Runs the inline script against a fake <html> and localStorage, as the browser does before the first paint.
function run(stored: string | null, throws = false): string | undefined {
  const html = { dataset: { theme: 'dark' } as Record<string, string> };
  const localStorage = {
    getItem: () => {
      if (throws) throw new Error('blocked');
      return stored;
    },
  };
  new Function('document', 'localStorage', THEME_SCRIPT)({ documentElement: html }, localStorage);
  return html.dataset.theme;
}

describe('THEME_SCRIPT', () => {
  it('keeps dusk when nothing is saved', () => expect(run(null)).toBe('dark'));
  it('switches to day when light was saved', () => expect(run('light')).toBe('light'));
  it('keeps dusk when dark was saved', () => expect(run('dark')).toBe('dark'));
  it('ignores junk', () => expect(run('purple')).toBe('dark'));
  it('survives blocked storage', () => expect(run(null, true)).toBe('dark'));
});
