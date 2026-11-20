import type { ColorValue } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

// The same line icons as the web app (web/src/components/shell/Icon.tsx).
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  map: 'M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7zM9 4v13M15 7v13',
  heart: 'M20.8 8.6c0 5.4-8.8 11-8.8 11S3.2 14 3.2 8.6A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.8 2.2z',
  sparkle:
    'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  database:
    'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  users:
    'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 5.2a3.5 3.5 0 0 1 0 6.6',
  trendDown: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
  trendUp: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  building: 'M4 21V8l8-5 8 5v13zM12 9v6M9 12h6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 13.2A8.5 8.5 0 1 1 10.8 3a6.8 6.8 0 0 0 10.2 10.2z',
  close: 'M6 6l12 12M18 6 6 18',
  refresh: 'M20 11a8 8 0 0 0-14.3-4.6M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6M20 20v-4h-4',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, color, size = 22 }: { name: IconName; color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={PATHS[name]} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Дишай ВТ: wind gusts on the brand indigo, the lowest in the "Добър" (EAQI 1) green.
// Same drawing as assets/brand/mark.svg, which the app icons are rendered from (scripts/make-icons.mjs).
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <LinearGradient id="brandTile" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6c64ff" />
          <Stop offset="1" stopColor="#4338ca" />
        </LinearGradient>
      </Defs>
      <Rect width={32} height={32} rx={9} fill="url(#brandTile)" />
      <G transform="translate(4.5 4.3) scale(0.96)" fill="none" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M9.59 4.59A2 2 0 1 1 11 8H2" stroke="#ffffff" />
        <Path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" stroke="#ffffff" />
        <Path d="M12.59 19.41A2 2 0 1 0 14 16H2" stroke="#50c4a8" />
      </G>
    </Svg>
  );
}
