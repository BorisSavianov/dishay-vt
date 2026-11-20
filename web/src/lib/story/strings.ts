// Copy for the landing story (/). Separate from lib/aq/strings.ts so the dashboard's strings stay untouched.
import type { Lang } from '@/lib/types';

export const STORY_BG = {
  'ch1.kicker': 'Велико Търново. Зима.',
  'ch1.title': 'Дишай ВТ',
  'ch1.lead': 'Знаем кога въздухът ще е мръсен. Ден по-рано.',
  'ch1.cue': 'Превърти надолу',
  'ch2.kicker': '18 декември 2025',
  'ch2.title': 'Градът изчезва в смог',
  'ch2.stat': 'PM10 средно за деня: {value} µg/m³',
  'ch2.limit': 'Нормата на ЕС е {limit}',
  'ch2.clock': '{hour}:00',
  'ch2.hourly': 'PM10 в този час: {value} µg/m³',
  'ch3.kicker': 'Данните',
  'ch3.title': '{sensors} граждански сензора',
  'ch3.readings': '{readings} почасови измервания',
  'ch3.sources': '{n} източника на данни',
  'ch4.kicker': '17 декември 2025, вечерта',
  'ch4.title': 'Предупредихме вечерта преди това',
  'ch4.alert': 'Утре въздухът във ВТ ще е умерен. Ако имаш астма, ограничи времето навън.',
  'ch4.alertTime': '17.12, 19:00',
  'ch4.stat': '{hits} от {bad} лоши дни',
  'ch4.statLead': 'Миналата зима предупредихме вечерта преди',
  'ch4.sub': 'CAMS: {camsHits} от {bad}, но с {camsFalse} фалшиви тревоги (ние: {falseAlarms})',
  'ch5.kicker': 'Доказателството',
  'ch5.title': 'По-точно от официалната прогноза',
  'ch5.ours': 'Нашият модел',
  'ch5.cams': 'CAMS (ЕС)',
  'ch5.pct': '{pct}% по-точно',
  'ch5.season': 'Този сезон: {model} срещу {cams} → {pct}%',
  'ch5.unit': 'средна грешка, PM2.5, µg/m³, 24 ч напред, ВТ, зима 2025/26',
  'ch6.kicker': 'Причините',
  'ch6.title': 'Кой замърсява?',
  'ch6.heating': 'отопление',
  'ch6.regional': 'пренос',
  'ch6.other': 'друго',
  'ch6.traffic': 'трафик',
  'ch6.estimate': 'оценка, миналата зима',
  'ch6.whatif': 'Ако {pct}% от домовете на дърва сменят отоплението: {days} вместо {base} лоши дни.',
  'ch7.kicker': 'Днес',
  'ch7.title': 'А сега?',
  'ch7.level': 'Въздухът във ВТ: {level}',
  'ch7.pm': 'PM2.5 {pm25} · PM10 {pm10} µg/m³',
  'ch7.updated': 'Обновено днес, {time}',
  'ch7.bundled': 'Последната записана прогноза',
  'ch7.none': 'Няма данни за този час',
  'ch8.title': 'Дишай спокойно',
  'ch8.lead': 'Прогноза 72 часа напред за всеки сензор, всеки час.',
  'ch8.forecast': 'Отвори прогнозата',
  'ch8.telegram': 'Предупреждения в Телеграм',
  'ch8.telegramHint': 'Сканирай или натисни',
  'ch8.app': 'iOS приложение (демо)',
  'bar.live': 'Прогнозата на живо →',
  'meta.title': 'Дишай ВТ – прогноза за въздуха във Велико Търново',
  'meta.description': 'Знаем кога въздухът ще е мръсен. Ден по-рано.',
  'foot.sources': 'Данни: sensor.community, Open-Meteo, CAMS/Copernicus, OpenStreetMap, AWS Terrain Tiles (Mapzen; SRTM, EU-DEM)',
  'foot.method': 'Методология',
  'rail.label': 'Глави',
  'rail.go': 'Към глава {n}',
} as const;

export type StoryKey = keyof typeof STORY_BG;

export const STORY_EN: Record<StoryKey, string> = {
  'ch1.kicker': 'Veliko Tarnovo. Winter.',
  'ch1.title': 'Breathe VT',
  'ch1.lead': 'We know when the air will be dirty. A day ahead.',
  'ch1.cue': 'Scroll down',
  'ch2.kicker': '18 December 2025',
  'ch2.title': 'The town disappears into smog',
  'ch2.stat': 'PM10 daily mean: {value} µg/m³',
  'ch2.limit': 'The EU limit is {limit}',
  'ch2.clock': '{hour}:00',
  'ch2.hourly': 'PM10 this hour: {value} µg/m³',
  'ch3.kicker': 'The data',
  'ch3.title': '{sensors} citizen sensors',
  'ch3.readings': '{readings} hourly readings',
  'ch3.sources': '{n} data sources',
  'ch4.kicker': '17 December 2025, evening',
  'ch4.title': 'We warned the evening before',
  'ch4.alert': 'Tomorrow the air in VT will be moderate. If you have asthma, limit your time outside.',
  'ch4.alertTime': '17.12, 19:00',
  'ch4.stat': '{hits} of {bad} bad days',
  'ch4.statLead': 'Last winter we warned the evening before on',
  'ch4.sub': 'CAMS: {camsHits} of {bad}, but with {camsFalse} false alarms (ours: {falseAlarms})',
  'ch5.kicker': 'The proof',
  'ch5.title': 'More accurate than the official forecast',
  'ch5.ours': 'Our model',
  'ch5.cams': 'CAMS (EU)',
  'ch5.pct': '{pct}% more accurate',
  'ch5.season': 'This season: {model} vs {cams} → {pct}%',
  'ch5.unit': 'mean error, PM2.5, µg/m³, 24 h ahead, VT, winter 2025/26',
  'ch6.kicker': 'The causes',
  'ch6.title': 'Who pollutes?',
  'ch6.heating': 'heating',
  'ch6.regional': 'transported',
  'ch6.other': 'other',
  'ch6.traffic': 'traffic',
  'ch6.estimate': 'estimate, last winter',
  'ch6.whatif': 'If {pct}% of wood-heated homes switch heating: {days} instead of {base} bad days.',
  'ch7.kicker': 'Today',
  'ch7.title': 'And now?',
  'ch7.level': 'The air in VT: {level}',
  'ch7.pm': 'PM2.5 {pm25} · PM10 {pm10} µg/m³',
  'ch7.updated': 'Updated today, {time}',
  'ch7.bundled': 'The last saved forecast',
  'ch7.none': 'No data for this hour',
  'ch8.title': 'Breathe easy',
  'ch8.lead': 'A 72-hour forecast for every sensor, every hour.',
  'ch8.forecast': 'Open the forecast',
  'ch8.telegram': 'Alerts on Telegram',
  'ch8.telegramHint': 'Scan or tap',
  'ch8.app': 'iOS app (demo)',
  'bar.live': 'Live forecast →',
  'meta.title': 'Breathe VT – air quality forecast for Veliko Tarnovo',
  'meta.description': 'We know when the air will be dirty. A day ahead.',
  'foot.sources': 'Data: sensor.community, Open-Meteo, CAMS/Copernicus, OpenStreetMap, AWS Terrain Tiles (Mapzen; SRTM, EU-DEM)',
  'foot.method': 'Methodology',
  'rail.label': 'Chapters',
  'rail.go': 'Go to chapter {n}',
};

const TABLE: Record<Lang, Record<StoryKey, string>> = { bg: STORY_BG, en: STORY_EN };

export function story(lang: Lang, key: StoryKey, vars?: Record<string, string | number>): string {
  let text = TABLE[lang][key];
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

const LOCALE: Record<Lang, string> = { bg: 'bg-BG', en: 'en-GB' };

// 3,2 in Bulgarian, 3.2 in English; 'millions' gives „5,28 млн.“ / „5.28M“.
export function fmtNum(lang: Lang, n: number, digits = 0, unit?: 'millions'): string {
  const value = unit === 'millions' ? n / 1_000_000 : n;
  const s = new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: unit !== 'millions' && value >= 10_000 }).format(value);
  if (unit !== 'millions') return s;
  return lang === 'bg' ? `${s} млн.` : `${s}M`;
}
