import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AirProvider } from '../aq/store';
import { air, type AirKey } from '../aq/strings';
import { ColorModeProvider, useColorMode, useColors } from '../lib/color-mode';
import { LangProvider, useLang } from '../lib/lang';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LangProvider>
          <ColorModeProvider>
            <AirProvider>
              <AppTheme>
                <TabBar />
              </AppTheme>
            </AirProvider>
          </ColorModeProvider>
        </LangProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// The navigation theme follows the colour mode, so no screen flashes the wrong colour while it changes.
function AppTheme({ children }: { children: ReactNode }) {
  const { mode } = useColorMode();
  return <ThemeProvider value={mode === 'dark' ? DarkTheme : DefaultTheme}>{children}</ThemeProvider>;
}

// The four tabs of the plan (docs/hackathon-plan.md, Boris): air now, the forecast map, health help, profile.
const TABS: { name: string; label: AirKey; sf: { default: string; selected: string }; md: string }[] = [
  { name: 'index', label: 'tab.air', sf: { default: 'aqi.medium', selected: 'aqi.medium' }, md: 'air' },
  { name: 'map', label: 'tab.map', sf: { default: 'map', selected: 'map.fill' }, md: 'map' },
  { name: 'health', label: 'tab.health', sf: { default: 'cross.case', selected: 'cross.case.fill' }, md: 'medical_services' },
  { name: 'profile', label: 'tab.profile', sf: { default: 'person.crop.circle', selected: 'person.crop.circle.fill' }, md: 'person' },
];

// Native tab bar: on iOS 26+ the system draws it as Liquid Glass and shrinks it while scrolling down.
function TabBar() {
  const { lang } = useLang();
  const c = useColors();
  return (
    <NativeTabs minimizeBehavior="onScrollDown" tintColor={c.accentStrong}>
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Icon sf={tab.sf as never} md={tab.md as never} />
          <NativeTabs.Trigger.Label>{air(lang, tab.label)}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
