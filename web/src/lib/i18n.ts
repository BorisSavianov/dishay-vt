import type { Lang } from './types';

const bg = {
  'site.title': 'Велико Търново: население и здравни заведения',
  'site.lead': 'Публични данни за Велико Търново. Всяка цифра има източник и дата.',
  'lang.label': 'Език',
  'lang.bg': 'Български',
  'lang.en': 'English',
  'notice.bundled': 'Показани са вградените копия на данните. Базата данни не се използва.',
  'stat.population.label': 'Население през {year}',
  'stat.population.sub': 'спрямо {first}: {pct}',
  'stat.physicians.label': 'Лекари на 1000 души, България',
  'stat.physicians.sub': 'национален показател, {year}',
  'facilities.total.label': 'Здравни заведения и спирки',
  'facilities.total.sub': 'точки в района на OpenStreetMap',
  'chart.population.title': 'Население 2015–2025',
  'chart.population.alt': 'Линейна графика: население от {first} до {last}',
  'facilities.title': 'Карта на точките',
  'facilities.map.alt':
    'Карта с точки: аптеки, болници, клиники, лекари и спирки във Велико Търново',
  'facilities.caveat':
    'Данните от OpenStreetMap се създават доброволно. Границата на района не е проверена.',
  'summary.title': 'Обобщение',
  'summary.intro': 'Кратко обобщение на всяка част. AI вижда само цифрите по-горе.',
  'summary.card.population': 'Население',
  'summary.card.physicians': 'Лекари',
  'summary.card.facilities': 'Здравни заведения',
  'summary.button': 'Обобщи',
  'summary.loading': 'Изчисляване…',
  'summary.error': 'Обобщението не е налично. Опитайте отново.',
  'summary.cached': 'от кеша',
  'summary.provider.groq': 'AI: Groq',
  'summary.provider.gemini': 'AI: Gemini',
  'summary.provider.mock': 'Без жив AI: текст, съставен от цифрите',
  'sources.title': 'Източници',
  'sources.asof': 'дата на данните',
  'sources.license': 'лиценз',
  'type.pharmacy': 'аптеки',
  'type.hospital': 'болници',
  'type.clinic': 'клиники',
  'type.doctors': 'лекари',
  'type.bus_stop': 'спирки',
  'facts.population': 'Население на Велико Търново',
  'facts.physicians': 'Лекари на 1000 души, България',
  'facts.facilities': 'Здравни заведения и спирки, Велико Търново (общо)',
} as const;

export type MessageKey = keyof typeof bg;

const en: Record<MessageKey, string> = {
  'site.title': 'Veliko Tarnovo: population and health facilities',
  'site.lead': 'Public data for Veliko Tarnovo. Every figure has a source and a date.',
  'lang.label': 'Language',
  'lang.bg': 'Bulgarian',
  'lang.en': 'English',
  'notice.bundled': 'Showing the bundled copies of the data. The database is not in use.',
  'stat.population.label': 'Population in {year}',
  'stat.population.sub': 'versus {first}: {pct}',
  'stat.physicians.label': 'Physicians per 1,000 people, Bulgaria',
  'stat.physicians.sub': 'national figure, {year}',
  'facilities.total.label': 'Health facilities and bus stops',
  'facilities.total.sub': 'points in the OpenStreetMap area',
  'chart.population.title': 'Population 2015–2025',
  'chart.population.alt': 'Line chart: population from {first} to {last}',
  'facilities.title': 'Map of points',
  'facilities.map.alt':
    'Map of points: pharmacies, hospitals, clinics, doctors and bus stops in Veliko Tarnovo',
  'facilities.caveat':
    'OpenStreetMap data is volunteer-made. The area boundary has not been checked.',
  'summary.title': 'Summary',
  'summary.intro': 'A short summary of each part. The AI only sees the figures above.',
  'summary.card.population': 'Population',
  'summary.card.physicians': 'Physicians',
  'summary.card.facilities': 'Health facilities',
  'summary.button': 'Summarise',
  'summary.loading': 'Working…',
  'summary.error': 'The summary is not available. Try again.',
  'summary.cached': 'cached',
  'summary.provider.groq': 'AI: Groq',
  'summary.provider.gemini': 'AI: Gemini',
  'summary.provider.mock': 'No live AI: text built from the figures',
  'sources.title': 'Sources',
  'sources.asof': 'data date',
  'sources.license': 'licence',
  'type.pharmacy': 'pharmacies',
  'type.hospital': 'hospitals',
  'type.clinic': 'clinics',
  'type.doctors': 'doctors',
  'type.bus_stop': 'bus stops',
  'facts.population': 'Population of Veliko Tarnovo',
  'facts.physicians': 'Physicians per 1,000 people, Bulgaria',
  'facts.facilities': 'Health facilities and bus stops, Veliko Tarnovo (total)',
};

export const messages: Record<Lang, Record<MessageKey, string>> = { bg, en };

export function t(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  let text: string = messages[lang][key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, String(value));
    }
  }
  return text;
}
