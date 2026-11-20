'use client';

import { Icon } from './Icon';
import { useTheme, type Theme } from './useTheme';

export function ThemeToggle({ label, toLight, toDark }: { label: string; toLight: string; toDark: string }) {
  const theme = useTheme();

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem('theme', next);
    } catch {
      // Storage can be blocked. The theme still changes for this visit.
    }
  }

  const target = theme === 'dark' ? toLight : toDark;
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={`${label}: ${target}`} title={target}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
