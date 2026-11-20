// App-wide air-quality state: the forecast, the chosen profile and home station (saved on the phone),
// and the alert status. Reloads the forecast when the app comes back to the foreground.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useLang } from '../lib/lang';
import { alertsAllowed, askForAlerts, scheduleAlerts } from './alerts';
import { fetchForecast } from './api';
import type { Profile } from './levels';
import type { AqForecast, AqSource, AqStation } from './types';

const PREFS_KEY = 'aq.prefs';
const STALE_MS = 15 * 60_000;

type Prefs = { profile: Profile; stationId: string | null; onboarded: boolean };

type AirState = {
  forecast: AqForecast | null;
  source: AqSource | null;
  loading: boolean;
  home: AqStation | null;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  refresh: () => void;
  alerts: { allowed: boolean; scheduled: number };
  enableAlerts: () => Promise<void>;
};

const AirContext = createContext<AirState | null>(null);

const DEFAULT_PREFS: Prefs = { profile: 'asthma', stationId: null, onboarded: false };

function pickHome(f: AqForecast | null, id: string | null): AqStation | null {
  if (!f) return null;
  return f.stations.find((s) => s.id === id) ?? f.stations.find((s) => s.featured) ?? f.stations[0] ?? null;
}

export function AirProvider({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);
  const [forecast, setForecast] = useState<AqForecast | null>(null);
  const [source, setSource] = useState<AqSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState({ allowed: false, scheduled: 0 });
  const loadedAt = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => raw && setPrefsState({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) }))
      .catch(() => {})
      .finally(() => setPrefsReady(true));
  }, []);

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setPrefsState((old) => {
      const next = { ...old, ...p };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchForecast(prefs.stationId ? [prefs.stationId] : []);
    setForecast(r.data);
    setSource(r.source);
    loadedAt.current = Date.now();
    setLoading(false);
  }, [prefs.stationId]);

  useEffect(() => {
    if (prefsReady) void load();
  }, [prefsReady, load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - loadedAt.current > STALE_MS) void load();
    });
    return () => sub.remove();
  }, [load]);

  const home = useMemo(() => pickHome(forecast, prefs.stationId), [forecast, prefs.stationId]);

  // Re-plan the warnings whenever the forecast, station, profile or language changes.
  useEffect(() => {
    if (!home || !prefs.onboarded) return;
    let cancelled = false;
    (async () => {
      try {
        const allowed = await alertsAllowed();
        const scheduled = allowed ? await scheduleAlerts(lang, home, prefs.profile) : 0;
        if (!cancelled) setAlerts({ allowed, scheduled });
      } catch {
        // Notifications are unavailable (for example in a build without the module): the screens still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [home, prefs.profile, prefs.onboarded, lang]);

  const enableAlerts = useCallback(async () => {
    try {
      const allowed = await askForAlerts();
      const scheduled = allowed && home ? await scheduleAlerts(lang, home, prefs.profile) : 0;
      setAlerts({ allowed, scheduled });
    } catch {
      setAlerts({ allowed: false, scheduled: 0 });
    }
  }, [home, lang, prefs.profile]);

  const value = useMemo<AirState>(
    () => ({ forecast, source, loading, home, prefs, setPrefs, refresh: () => void load(), alerts, enableAlerts }),
    [forecast, source, loading, home, prefs, setPrefs, load, alerts, enableAlerts],
  );

  return <AirContext.Provider value={value}>{children}</AirContext.Provider>;
}

export function useAir(): AirState {
  const s = useContext(AirContext);
  if (!s) throw new Error('useAir must be used inside AirProvider');
  return s;
}
