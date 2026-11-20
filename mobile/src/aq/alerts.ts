// Local notifications for bad-air days (expo-notifications, SDK 58 API). No push server: the app plans
// the warnings from the forecast each time it loads one.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { Lang } from '../shared/types';
import { clampLevel, levelOf, localDate, planAlerts, type Profile } from './levels';
import { advice, air, levelName } from './strings';
import type { AqDay, AqStation } from './types';

const SENT_KEY = 'aq.alerts.sent';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function alertsAllowed(): Promise<boolean> {
  const s = await Notifications.getPermissionsAsync();
  return s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function askForAlerts(): Promise<boolean> {
  const s = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
  return s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

function content(lang: Lang, station: AqStation, profile: Profile, day: AqDay, fireAt: Date) {
  const level = clampLevel(day.level);
  const sameDay = localDate(fireAt) === day.date;
  return {
    title: air(lang, sameDay ? 'notif.title.today' : 'notif.title.tomorrow', {
      level: levelName(lang, level).toLowerCase(),
      place: station.city,
    }),
    body: air(lang, 'notif.body', { pm10: Math.round(day.pm10_mean), advice: advice(lang, profile, level) }),
    data: { stationId: station.id, date: day.date },
  };
}

// key -> when its warning was scheduled to fire (ms). A key whose time has passed was delivered.
async function readScheduled(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(SENT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

// Replaces every pending warning with the plan for this forecast. Returns how many are scheduled.
export async function scheduleAlerts(lang: Lang, station: AqStation, profile: Profile): Promise<number> {
  if (!(await alertsAllowed())) return 0;
  const now = Date.now();
  const scheduled = await readScheduled();
  const sent = new Set(Object.entries(scheduled).filter(([, at]) => at <= now).map(([k]) => k));
  await Notifications.cancelAllScheduledNotificationsAsync();
  const plan = planAlerts(station, profile, new Date(now), sent);
  const next: Record<string, number> = {};
  for (const k of sent) next[k] = scheduled[k]!;
  for (const p of plan) {
    await Notifications.scheduleNotificationAsync({
      content: content(lang, station, profile, p.day, p.fireAt),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.fireAt },
    });
    next[p.key] = p.fireAt.getTime();
  }
  // Forget keys older than a week.
  for (const [k, at] of Object.entries(next)) if (at < now - 7 * 86400_000) delete next[k];
  await AsyncStorage.setItem(SENT_KEY, JSON.stringify(next)).catch(() => {});
  return plan.length;
}

// For the demo: the warning for the worst forecast day, delivered in 3 seconds (lock the phone to see it).
export async function testAlert(lang: Lang, station: AqStation, profile: Profile): Promise<void> {
  if (!(await alertsAllowed()) && !(await askForAlerts())) return;
  const worst =
    [...station.daily].sort((a, b) => b.level - a.level || b.pm10_mean - a.pm10_mean)[0] ??
    ({
      date: localDate(new Date()),
      pm10_mean: station.latest?.pm10 ?? 0,
      pm25_mean: station.latest?.pm25 ?? 0,
      level: levelOf(station.latest?.pm25 ?? 0, station.latest?.pm10 ?? 0),
      exceeds_eu_limit: false,
      reasons: [],
    } satisfies AqDay);
  // Worded as if sent the evening before, so the demo reads "Утре: …".
  const [y, m, d] = worst.date.split('-').map(Number) as [number, number, number];
  const eveningBefore = new Date(y, m - 1, d - 1, 19);
  await Notifications.scheduleNotificationAsync({
    content: content(lang, station, profile, worst, eveningBefore),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3 },
  });
}
