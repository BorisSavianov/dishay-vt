import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// True when the OS asks for reduced motion. Animated views render their final state while it is true.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live) setReduce(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => setReduce(value));
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  return reduce;
}
