import type { Lang } from './types';

export type SearchParams = Promise<{ lang?: string | string[] }>;

// Bulgarian is the default; ?lang=en switches to English. Anything else is Bulgarian.
export function langOf(params: { lang?: string | string[] }): Lang {
  return params.lang === 'en' ? 'en' : 'bg';
}

// A link inside the app that keeps the chosen language.
export function withLang(path: string, lang: Lang): string {
  return `${path}?lang=${lang}`;
}
