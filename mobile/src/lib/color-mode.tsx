import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import { palettes, type Mode, type Palette } from '../theme/palette';

type ModeState = { mode: Mode; colors: Palette; toggle: () => void };

const ColorModeContext = createContext<ModeState | null>(null);

// Light by default, as in the design. The header toggle switches to dark.
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('light');

  useEffect(() => {
    // Also sets the system appearance, so the native bars and their glass follow the app's mode.
    Appearance.setColorScheme(mode);
  }, [mode]);

  const value = useMemo<ModeState>(
    () => ({
      mode,
      colors: palettes[mode],
      toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')),
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
