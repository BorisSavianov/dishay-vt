import { createContext, type ComponentRef, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useReduceMotion } from '../lib/motion';

// The story's motion, toned down for a tool (web components/shell/PageMotion.tsx): cards below the first screen
// rise in 24 pt once as they scroll into view, never in reverse. Cards already on screen are never animated,
// so nothing visible blinks when a tab opens. Reduced motion: no reveals at all.

type Listener = (scrollY: number) => void;
type ScrollState = { y: { current: number }; viewport: number; subscribe: (fn: Listener) => () => void };

const ScrollContext = createContext<ScrollState | null>(null);

/** Owns the scroll position for the reveals in one screen. Spread `onScroll` on the screen's ScrollView. */
export function useRevealScroll(viewport: number) {
  const y = useRef(0);
  const listeners = useRef(new Set<Listener>());
  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    y.current = e.nativeEvent.contentOffset.y;
    for (const fn of listeners.current) fn(y.current);
  }, []);
  const state = useMemo<ScrollState>(() => ({ y, viewport, subscribe }), [viewport, subscribe]);
  return { state, onScroll };
}

export function RevealProvider({ state, children }: { state: ScrollState; children: ReactNode }) {
  return <ScrollContext.Provider value={state}>{children}</ScrollContext.Provider>;
}

const RISE = 24;

export function Reveal({ children }: { children: ReactNode }) {
  const scroll = useContext(ScrollContext);
  const reduce = useReduceMotion();
  // Visible until measured: a card in the first screen must never start hidden.
  const progress = useRef(new Animated.Value(1)).current;
  const ref = useRef<ComponentRef<typeof View>>(null);
  const state = useRef<'unknown' | 'waiting' | 'done'>('unknown');
  const top = useRef(0);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubscribe.current?.(), []);

  const play = useCallback(() => {
    state.current = 'done';
    unsubscribe.current?.();
    Animated.timing(progress, {
      toValue: 1,
      duration: 600,
      easing: Easing.bezier(0.2, 0.7, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const onLayout = useCallback(() => {
    if (!scroll || reduce || state.current !== 'unknown') return;
    ref.current?.measureInWindow((_x, y) => {
      if (state.current !== 'unknown') return;
      top.current = y + scroll.y.current;
      if (y < scroll.viewport) {
        state.current = 'done';
        return;
      }
      // Below the fold: hide it (off screen, so no blink) and wait for the scroll to reach it.
      state.current = 'waiting';
      progress.setValue(0);
      unsubscribe.current = scroll.subscribe((scrollY) => {
        if (state.current === 'waiting' && scrollY + scroll.viewport * 0.92 > top.current) play();
      });
    });
  }, [scroll, reduce, progress, play]);

  if (!scroll || reduce) return <>{children}</>;

  return (
    <Animated.View
      ref={ref}
      onLayout={onLayout}
      style={{
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}
