// Copied from mobile/src/aq/strings.ts (Boris), plus web-only keys at the end of each table.
// Strings for the air-quality screens. The English table is typed against the Bulgarian keys.
import type { Lang } from '../types';
import type { Level, Profile } from './levels';

const bg = {
  'tab.air': 'Въздух',
  'air.title': 'Въздух сега',
  'air.lead': 'Прогноза за фините прахови частици 72 часа напред, от отворени данни и наш модел.',
  'air.demo': 'Демо данни: прогнозата на живо още не е достъпна. Числата са примерни.',
  'air.live': 'Прогноза на живо · {time}',
  'air.retry': 'Опитай пак',
  'air.now.measured': 'измерено преди малко',
  'air.now.forecast': 'по прогноза за този час',
  'air.chart.title': 'Следващите 72 часа',
  'air.chart.sub': 'PM2.5, µg/m³. Лентата е вероятният диапазон; пунктирът е официалната прогноза CAMS.',
  'air.chart.ours': 'Нашият модел',
  'air.chart.cams': 'CAMS (Copernicus)',
  'air.days.title': 'Следващите дни',
  'air.days.why': 'Защо',
  'air.eu': 'над нормата на ЕС',
  'air.best.title': 'Най-чистият прозорец днес',
  'air.best.body': '{start}–{end} · около {pm} µg/m³ PM2.5',
  'air.best.none': 'Няма достатъчно данни за деня.',
  'air.station': 'Станция',
  'air.change': 'Смени',
  'air.profile.title': 'За кого следим?',
  'air.profile.lead': 'Изберете профил и станция. Ще ви предупредим вечерта преди лош ден.',
  'air.profile.save': 'Запази',
  'air.profile.edit': 'Профил и известия',
  'air.alerts.title': 'Известия',
  'air.alerts.on': 'Включени · {count} планирани',
  'air.alerts.off': 'Изключени. Разрешете известията, за да получавате предупреждения.',
  'air.alerts.enable': 'Разреши известията',
  'air.alerts.test': 'Тествай известие сега',
  'air.alerts.none': 'Няма лоши дни в прогнозата за вашия профил.',
  'air.map.title': 'Карта на въздуха',
  'air.map.lead': 'Цветът е нивото по прогноза. Изберете час напред.',
  'air.map.now': 'Сега',
  'air.source': 'Източници: sensor.community (ODbL), Open-Meteo (CC BY 4.0), CAMS/Copernicus.',
  'day.today': 'Днес',
  'day.tomorrow': 'Утре',
  'notif.title.tomorrow': 'Утре: {level} въздух в {place}',
  'notif.title.today': 'Днес: {level} въздух в {place}',
  'notif.body': 'PM10 ~{pm10} µg/m³. {advice}',
  // Web only
  'web.title': 'Дишай ВТ',
  'web.lead': 'Прогноза за мръсния въздух 72 часа напред и предупреждение за чувствителните групи.',
  'web.bundled': 'Показана е последната записана прогноза, не тази от последния час.',
  'web.generated': 'Прогноза от {time}',
  'web.now.title': 'Въздухът сега',
  'web.now.pm': 'PM2.5 {pm25} · PM10 {pm10} µg/m³',
  'web.now.none': 'Няма данни за този час.',
  'web.profile': 'Съвет за',
  'web.station.go': 'Покажи',
  'web.chart.pm': 'Замърсител',
  'web.chart.band': 'Вероятен диапазон',
  'web.chart.alt': 'Диаграма: прогноза за {pm} за {name}, 72 часа',
  'web.chart.table': 'Стойности по часове',
  'web.chart.hour': 'Час',
  'web.chart.now': 'сега',
  'web.chart.readout': '{time}: {value} µg/m³',
  'web.days.means': 'PM10 {pm10} · PM2.5 {pm25} µg/m³ средно',
  'web.days.level': 'Ниво {level} от 6',
  'web.model.title': 'По-точно от официалната прогноза?',
  'web.model.body': 'Средна грешка за 24 часа напред: нашият модел {model}, CAMS {cams}, „утре = днес“ {persistence} µg/m³.',
  'web.model.pending': 'Моделът се обучава. Сравнението с CAMS ще се появи тук.',
  'web.model.cta': 'Защо му вярваме',
} as const;

export type AirKey = keyof typeof bg;

const en: Record<AirKey, string> = {
  'tab.air': 'Air',
  'air.title': 'Air now',
  'air.lead': 'Fine-particle forecast 72 hours ahead, from open data and our model.',
  'air.demo': 'Demo data: the live forecast is not available yet. The numbers are examples.',
  'air.live': 'Live forecast · {time}',
  'air.retry': 'Try again',
  'air.now.measured': 'measured minutes ago',
  'air.now.forecast': 'forecast for this hour',
  'air.chart.title': 'Next 72 hours',
  'air.chart.sub': 'PM2.5, µg/m³. The band is the likely range; the dashed line is the official CAMS forecast.',
  'air.chart.ours': 'Our model',
  'air.chart.cams': 'CAMS (Copernicus)',
  'air.days.title': 'Next days',
  'air.days.why': 'Why',
  'air.eu': 'above the EU limit',
  'air.best.title': 'Cleanest window today',
  'air.best.body': '{start}–{end} · about {pm} µg/m³ PM2.5',
  'air.best.none': 'Not enough data for today.',
  'air.station': 'Station',
  'air.change': 'Change',
  'air.profile.title': 'Who are we watching for?',
  'air.profile.lead': 'Pick a profile and a station. We warn you the evening before a bad day.',
  'air.profile.save': 'Save',
  'air.profile.edit': 'Profile and alerts',
  'air.alerts.title': 'Alerts',
  'air.alerts.on': 'On · {count} scheduled',
  'air.alerts.off': 'Off. Allow notifications to get warnings.',
  'air.alerts.enable': 'Allow notifications',
  'air.alerts.test': 'Test an alert now',
  'air.alerts.none': 'No bad days in the forecast for your profile.',
  'air.map.title': 'Air map',
  'air.map.lead': 'Colour is the forecast level. Pick how far ahead.',
  'air.map.now': 'Now',
  'air.source': 'Sources: sensor.community (ODbL), Open-Meteo (CC BY 4.0), CAMS/Copernicus.',
  'day.today': 'Today',
  'day.tomorrow': 'Tomorrow',
  'notif.title.tomorrow': 'Tomorrow: {level} air in {place}',
  'notif.title.today': 'Today: {level} air in {place}',
  'notif.body': 'PM10 ~{pm10} µg/m³. {advice}',
  // Web only
  'web.title': 'Breathe VT',
  'web.lead': 'A 72-hour forecast of dirty air, with warnings for sensitive groups.',
  'web.bundled': 'Showing the last saved forecast, not the one from the last hour.',
  'web.generated': 'Forecast from {time}',
  'web.now.title': 'Air now',
  'web.now.pm': 'PM2.5 {pm25} · PM10 {pm10} µg/m³',
  'web.now.none': 'No data for this hour.',
  'web.profile': 'Advice for',
  'web.station.go': 'Show',
  'web.chart.pm': 'Pollutant',
  'web.chart.band': 'Likely range',
  'web.chart.alt': 'Chart: {pm} forecast for {name}, 72 hours',
  'web.chart.table': 'Values by hour',
  'web.chart.hour': 'Hour',
  'web.chart.now': 'now',
  'web.chart.readout': '{time}: {value} µg/m³',
  'web.days.means': 'PM10 {pm10} · PM2.5 {pm25} µg/m³ average',
  'web.days.level': 'Level {level} of 6',
  'web.model.title': 'More accurate than the official forecast?',
  'web.model.body': 'Mean error 24 hours ahead: our model {model}, CAMS {cams}, "tomorrow = today" {persistence} µg/m³.',
  'web.model.pending': 'The model is training. The comparison with CAMS will appear here.',
  'web.model.cta': 'Why we trust it',
};

const table: Record<Lang, Record<AirKey, string>> = { bg, en };

export function air(lang: Lang, key: AirKey, vars?: Record<string, string | number>): string {
  let text: string = table[lang][key];
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

const LEVEL_NAMES: Record<Lang, Record<Level, string>> = {
  bg: { 1: 'Добър', 2: 'Задоволителен', 3: 'Умерен', 4: 'Лош', 5: 'Много лош', 6: 'Изключително лош' },
  en: { 1: 'Good', 2: 'Fair', 3: 'Moderate', 4: 'Poor', 5: 'Very poor', 6: 'Extremely poor' },
};

export function levelName(lang: Lang, level: Level): string {
  return LEVEL_NAMES[lang][level];
}

const PROFILE_NAMES: Record<Lang, Record<Profile, string>> = {
  bg: { asthma: 'Астма / дишане', child: 'Дете', elderly: 'Възрастен', runner: 'Бегач / спорт', general: 'Друго' },
  en: { asthma: 'Asthma / breathing', child: 'Child', elderly: 'Older adult', runner: 'Runner / sport', general: 'Other' },
};

export function profileName(lang: Lang, p: Profile): string {
  return PROFILE_NAMES[lang][p];
}

// Short advice for a profile at a level. Level 1–2 has one line for everyone.
export function advice(lang: Lang, p: Profile, level: Level): string {
  if (level <= 2) return lang === 'bg' ? 'Чист въздух. Подходящо за навън.' : 'Clean air. Good for being outside.';
  const severe = level >= 5;
  const bgText: Record<Profile, string> = {
    asthma: severe
      ? 'Останете вътре, затворете прозорците, дръжте инхалатора под ръка.'
      : 'Ограничете времето навън вечер; носете инхалатора.',
    child: severe ? 'Без игри навън днес. Проветрявайте рано сутрин.' : 'Без дълги игри навън след 17:00.',
    elderly: severe ? 'Избягвайте излизане; при задух потърсете лекар.' : 'Разходките – по обед, кратко и бавно.',
    runner: severe ? 'Без бягане навън. Тренирайте вътре.' : 'Бягайте в най-чистия прозорец, леко темпо.',
    general: severe ? 'Ограничете времето навън и проветряването.' : 'Чувствителните хора да ограничат усилията навън.',
  };
  const enText: Record<Profile, string> = {
    asthma: severe ? 'Stay inside, keep windows closed, keep your inhaler close.' : 'Limit time outside in the evening; carry your inhaler.',
    child: severe ? 'No outdoor play today. Air rooms early in the morning.' : 'No long outdoor play after 17:00.',
    elderly: severe ? 'Avoid going out; see a doctor if short of breath.' : 'Walk around midday, short and slow.',
    runner: severe ? 'No outdoor running. Train inside.' : 'Run in the cleanest window, easy pace.',
    general: severe ? 'Limit time outside and airing rooms.' : 'Sensitive people should limit effort outside.',
  };
  return (lang === 'bg' ? bgText : enText)[p];
}
