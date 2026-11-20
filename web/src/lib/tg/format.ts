// The bot's messages, in Bulgarian plain text (no parse_mode).
import { alertLevelOf, bestWindow, clampLevel, isBadFor, localDate, type Level, type Profile } from '@/lib/aq/levels';
import { showSources, sourcesLine } from '@/lib/aq/sources';
import { advice, air, levelName, profileName } from '@/lib/aq/strings';
import type { AqDay, AqStation } from '@/lib/aq/types';
import type { Episode } from './episode';

export const LEVEL_EMOJI: Record<Level, string> = { 1: '🟢', 2: '🔵', 3: '🟡', 4: '🟠', 5: '🔴', 6: '🟣' };
const WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const pad = (n: number) => String(n).padStart(2, '0');
const emoji = (n: number) => LEVEL_EMOJI[clampLevel(n)];
const name = (n: number) => levelName('bg', clampLevel(n));

// Date and clock of an instant in Bulgaria, whatever the server's time zone.
function sofia(iso: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute') };
}
const clock = (iso: string) => {
  const s = sofia(iso);
  return `${pad(s.h)}:${pad(s.mi)}`;
};

// "YYYY-MM-DD" → its parts, read as a calendar date (no time zone).
function ymd(date: string): { y: number; m: number; d: number; weekday: string } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d, weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]! };
}
const ddmm = (date: string) => {
  const p = ymd(date);
  return `${pad(p.d)}.${pad(p.m)}`;
};

function reasons(day: AqDay): string {
  return day.reasons
    .filter((r) => r.impact > 0)
    .slice(0, 2)
    .map((r) => r.label_bg)
    .join(', ');
}

function when(date: string, now: Date): string {
  if (date === localDate(now)) return 'Днес';
  if (date === localDate(new Date(now.getTime() + 24 * 3600_000))) return 'Утре';
  return ddmm(date);
}

// The reply after a profile or station choice: the next 3 days for that profile.
export function formatForecast(station: AqStation, profile: Profile, now: Date, demo: boolean): string {
  const today = localDate(now);
  const days = station.daily.filter((d) => d.date >= today).slice(0, 3);
  const lines: string[] = [];
  if (demo) lines.push(air('bg', 'air.demo'));
  lines.push(`${station.name} · ${station.city}`, `Профил: ${profileName('bg', profile)}`, '');
  for (const d of days) {
    const p = ymd(d.date);
    lines.push(`${emoji(d.level)} ${p.weekday} ${ddmm(d.date)} · ${name(d.level)} · PM10 ~${Math.round(d.pm10_mean)} µg/m³`);
    const why = reasons(d);
    if (why) lines.push(`   ${why}`);
  }
  const first = days[0];
  if (first && showSources(first)) lines.push('', sourcesLine(first.sources, 'bg'));
  lines.push('');
  const bad = days.find((d) => isBadFor(profile, alertLevelOf(d)));
  lines.push(bad ? `⚠ ${when(bad.date, now)}: ${advice('bg', profile, alertLevelOf(bad))}` : `✅ ${advice('bg', profile, 1)}`);
  const best = bestWindow(station.hourly ?? [], now);
  if (best) {
    lines.push(
      `${air('bg', 'air.best.title')}: ${air('bg', 'air.best.body', { start: clock(best.start), end: clock(best.end), pm: Math.round(best.pm25) })}`,
    );
  }
  lines.push('', 'Ще ви пишем вечерта преди лош ден. /stop – спиране.');
  return lines.join('\n');
}

// A day-before (or same-morning) warning, worded like the app's notification.
export function formatAlert(station: AqStation, profile: Profile, day: AqDay, now: Date): string {
  const level = alertLevelOf(day);
  const key = day.date === localDate(now) ? 'notif.title.today' : 'notif.title.tomorrow';
  const title = air('bg', key, { level: name(level).toLocaleLowerCase('bg-BG'), place: station.city });
  const lines = [`${emoji(level)} ${title}`, air('bg', 'notif.body', { pm10: Math.round(day.pm10_mean), advice: advice('bg', profile, level) })];
  const why = reasons(day);
  if (why) lines.push(`Причини: ${why}`);
  return lines.join('\n');
}

// /demo: last winter's real smog day, as the model forecast it the day before. Always labelled a replay.
export function formatReplay(ep: Episode, profile: Profile): string {
  const date = ymd(ep.date);
  const f = ep.forecasts.find((x) => x.days_before === 1)!;
  const issued = sofia(f.issued);
  const level = clampLevel(f.daily.alert_level ?? f.daily.level);
  const prep = /^[ВФвф]/.test(ep.place) ? 'във' : 'в';
  const obs = ep.observed_daily;
  return [
    `🔁 Повторение от ${pad(date.d)}.${pad(date.m)}.${date.y}: реален смог ${prep} ${ep.place}, предупреден ден по-рано`,
    '',
    `Прогноза от ${pad(issued.d)}.${pad(issued.mo)}, ${pad(issued.h)}:${pad(issued.mi)}: ${emoji(level)} ${name(level)} · PM10 ~${Math.round(f.daily.pm10_mean)}`,
    `Измерено: ${emoji(obs.level)} ${name(obs.level)} · PM10 ~${Math.round(obs.pm10_mean)}${obs.exceeds_eu_limit ? ` · ${air('bg', 'air.eu')}` : ''}`,
    `CAMS: PM10 ~${Math.round(ep.cams_daily.pm10_mean)}`,
    '',
    `⚠ ${advice('bg', profile, level)}`,
    `Цялата зима: предупредихме вечерта преди за ${ep.score.model_alert.hits} от ${ep.score.bad_days} лоши дни.`,
  ].join('\n');
}
