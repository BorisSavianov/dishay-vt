import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useReduceMotion } from '../lib/motion';
import { COUNT_MS, countAt } from '../theme/look';

// A headline number that counts up from 0 once, ~0.9 s (web PageMotion's [data-count]). Screen readers and
// reduced motion get the final value straight away; a new value counts from 0 again.
export function CountUp({ value, decimals = 0, style }: { value: number; decimals?: number; style?: StyleProp<TextStyle> }) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      setShown(countAt(value, elapsed, decimals));
      if (elapsed < COUNT_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, decimals, reduce]);

  const final = value.toFixed(decimals);
  return (
    <Text style={[{ fontVariant: ['tabular-nums'] }, style]} accessibilityLabel={final}>
      {shown.toFixed(decimals)}
    </Text>
  );
}
