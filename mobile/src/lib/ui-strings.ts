import type { Lang } from '../shared/types';

// Mobile-only strings. Strings shared with the web stay in src/shared/i18n.ts.
// The English table is typed against the Bulgarian keys, so a missing English key fails typecheck.
const bg = {
  'mode.toggle': 'Цветова тема',
  'mode.light': 'Светла',
  'mode.dark': 'Тъмна',
  'chart.hint': 'плъзнете по графиката за други години',
  'ml.loading': 'Зареждане на модела…',
  'ml.retry': 'Опитай отново',
  'map.close': 'Затвори подробностите',
  'map.website': 'Отвори уебсайта',
} as const;

export type UiKey = keyof typeof bg;

const en: Record<UiKey, string> = {
  'mode.toggle': 'Colour theme',
  'mode.light': 'Light',
  'mode.dark': 'Dark',
  'chart.hint': 'drag across the chart for other years',
  'ml.loading': 'Loading the model…',
  'ml.retry': 'Try again',
  'map.close': 'Close details',
  'map.website': 'Open website',
};

const table: Record<Lang, Record<UiKey, string>> = { bg, en };

export function ui(lang: Lang, key: UiKey, vars?: Record<string, string | number>): string {
  let text: string = table[lang][key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, String(value));
    }
  }
  return text;
}
