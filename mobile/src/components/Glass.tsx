import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColorMode } from '../lib/color-mode';

// Liquid Glass when the system has it (iOS 26+, transparency not reduced); a solid surface otherwise.
const GLASS_OK = (() => {
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
})();

export function useGlass(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (!GLASS_OK) return;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => sub.remove();
  }, []);
  return GLASS_OK && !reduced;
}

export function Glass({
  children,
  style,
  fallback,
  tint,
  interactive = false,
  clear = false,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  // Background for the solid fallback.
  fallback: string;
  tint?: string;
  interactive?: boolean;
  clear?: boolean;
}) {
  const glass = useGlass();
  const { mode } = useColorMode();
  if (!glass) return <View style={[style, { backgroundColor: fallback }]}>{children}</View>;
  return (
    <GlassView
      style={style}
      glassEffectStyle={clear ? 'clear' : 'regular'}
      tintColor={tint}
      isInteractive={interactive}
      colorScheme={mode}
    >
      {children}
    </GlassView>
  );
}
