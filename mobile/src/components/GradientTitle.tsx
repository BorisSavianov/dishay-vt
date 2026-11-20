import MaskedViewClass from '@react-native-masked-view/masked-view';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useColors } from '../lib/color-mode';

// The package's class typings predate React 19's JSX types; the component itself is fine.
const MaskedView = MaskedViewClass as unknown as ComponentType<{ maskElement: ReactElement; children: ReactNode }>;

// The story's headline treatment (web .page-title): heavy, tight, with a vertical gradient through the letters,
// white to lavender at dusk, indigo to violet by day. The text is drawn once as a mask over the gradient,
// so it wraps exactly as a normal Text would. One header for screen readers.
export function GradientTitle({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={children}>
      <MaskedView maskElement={<Text style={style}>{children}</Text>}>
        {/* Invisible copy: gives the gradient the text's exact size. */}
        <Text style={[style, styles.ghost]} importantForAccessibility="no">
          {children}
        </Text>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <LinearGradient id="title" x1="0" y1="0" x2="0" y2="1">
              <Stop offset={c.titleStop} stopColor={c.titleTop} />
              <Stop offset="1" stopColor={c.titleBottom} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#title)" />
        </Svg>
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  ghost: { opacity: 0 },
});
