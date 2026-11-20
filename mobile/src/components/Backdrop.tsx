import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useColorMode } from '../lib/color-mode';
import type { Poster } from '../theme/look';

const POSTERS: Record<Poster, number> = {
  ch1: require('../../assets/story/ch1.webp'),
  ch7: require('../../assets/story/ch7.webp'),
};

// The story's smog colour (web components/story/atmosphere.ts), and a paler, warmer haze for day.
const HAZE = { dark: '#3d3a36', light: '#b9ad9f' } as const;

// The story's sky behind every tab (web components/shell/Backdrop.tsx + .backdrop in globals.css): a dark zenith,
// a glow low on the horizon and, on most tabs, one blurred chapter still that fades into the page.
// `smog` (0..1) lays the valley's haze over the still: the air tab passes the current level, so a bad day looks
// hazy, as the web's /now valley does.
// Sized from the window, not absoluteFill: an SVG laid out once keeps its first size, so a tab that was open
// while the iPhone Duo unfolded kept the narrow backdrop. The key redraws it on every window size.
export function Backdrop({ poster, smog = 0 }: { poster: Poster | null; smog?: number }) {
  const { mode, colors: c } = useColorMode();
  const { width, height } = useWindowDimensions();
  const size = { width, height };
  return (
    <View style={[styles.root, size]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg key={`sky-${width}x${height}`} width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.skyTop} />
            <Stop offset="0.7" stopColor={c.bg} />
          </LinearGradient>
          <RadialGradient id="horizon" cx="70%" cy="105%" rx="120%" ry="60%" fx="70%" fy="105%">
            <Stop offset="0" stopColor={c.skyHorizon} stopOpacity={1} />
            <Stop offset="0.6" stopColor={c.skyHorizon} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#sky)" />
        <Rect width="100%" height="100%" fill="url(#horizon)" />
      </Svg>

      {poster ? (
        <>
          <Image
            source={POSTERS[poster]}
            resizeMode="cover"
            blurRadius={28}
            fadeDuration={0}
            style={[styles.poster, { opacity: mode === 'dark' ? 0.4 : 0.28 }]}
          />
          {smog > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: HAZE[mode], opacity: smog * 0.6 }]} /> : null}
          {/* The still fades into the page from the middle down, as the web's mask does. */}
          <Svg key={`fade-${width}x${height}`} width={width} height={height} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.bg} stopOpacity={0} />
                <Stop offset="0.45" stopColor={c.bg} stopOpacity={0} />
                <Stop offset="0.95" stopColor={c.bg} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#fade)" />
          </Svg>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
  // Overscan so the blur has no soft edge, like the web's inset: -40px.
  poster: { position: 'absolute', top: -40, left: -40, right: -40, bottom: -40 },
});
