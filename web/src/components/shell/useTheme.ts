'use client';

import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

// The theme lives on <html data-theme>. An inline script in the layout sets it before the first paint,
// so components only read it (and watch for changes) instead of keeping their own copy.
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function read(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => 'light' as Theme);
}
