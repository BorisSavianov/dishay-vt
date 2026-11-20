import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import { DEFAULT_MODE, palettes, type Mode, type Palette } from '../theme/palette';

type ModeState = { mode: Mode; colors: Palette; toggle: () => void };

const ColorModeContext = createContext<ModeState | null>(null);
const THEME_KEY = 'theme';

// Dusk by default, as on the web; "day" (light) only when the user chose it. The choice is kept, like the web's
// localStorage 'theme' (same 'light' | 'dark' values).
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark') setMode(saved);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Also sets the system appearance, so the native bars and their glass follow the app's mode.
    Appearance.setColorScheme(mode);
  }, [mode]);

  const value = useMemo<ModeState>(
    () => ({
      mode,
      colors: palettes[mode],
      toggle: () =>
        setMode((m) => {
          const next: Mode = m === 'dark' ? 'light' : 'dark';
          AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
          return next;
        }),
    }),
    [mode],
  );

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

export function useColorMode(): ModeState {
  const state = useContext(ColorModeContext);
  if (!state) throw new Error('useColorMode must be used inside ColorModeProvider');
  return state;
}

export function useColors(): Palette {
  return useColorMode().colors;
}
