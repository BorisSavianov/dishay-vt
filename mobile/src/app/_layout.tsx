import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { ColorModeProvider, useColorMode, useColors } from '../lib/color-mode';
import { LangProvider, useLang } from '../lib/lang';
import { t, type MessageKey } from '../shared/i18n';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LangProvider>
          <ColorModeProvider>
            <AppTheme>
              <TabBar />
            </AppTheme>
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

const TABS: { name: string; label: MessageKey; icon: IconName }[] = [
  { name: 'index', label: 'tab.dashboard', icon: 'home' },
  { name: 'map', label: 'tab.map', icon: 'map' },
  { name: 'health', label: 'tab.health', icon: 'heart' },
  { name: 'insights', label: 'tab.ai', icon: 'sparkle' },
  { name: 'data', label: 'tab.data', icon: 'database' },
];

// The bottom bar of the design: five tabs, indigo for the active one. Each screen draws its own header.
// The Prediction screen is a sixth route that the Data tab opens.
function TabBar() {
  const { lang } = useLang();
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accentStrong,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(lang, tab.label),
            tabBarIcon: ({ color }) => <Icon name={tab.icon} color={color} />,
          }}
        />
      ))}
      {/* Opened from the Data tab, so it has no tab of its own. */}
      <Tabs.Screen
        name="predict"
        options={{ title: t(lang, 'nav.predict'), tabBarItemStyle: { display: 'none' } }}
      />
    </Tabs>
  );
}
