'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Level } from '@/lib/aq/levels';
import { nowSkyMode, smogForLevel } from '@/lib/look';
import { probeEnv, type StoryMode } from '@/lib/story/mode';
import { useTheme } from '@/components/shell/useTheme';

const NowSkyScene = dynamic(() => import('./NowSkyScene'), { ssr: false });

// The story's valley behind the dashboard's top cards, hazy as Veliko Tarnovo's air is right now.
// A still frame first (and for good on phones, weak devices and reduced motion); the 3D loads after the numbers.
export function NowSky({ level }: { level: Level | null }) {
  const theme = useTheme();
  const dusk = theme === 'dark';
  const [mode, setMode] = useState<StoryMode | null>(null);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMode(nowSkyMode(probeEnv()));
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => mq.matches && setMode('poster');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Stop drawing while the valley is off screen or the tab is hidden.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let visible = true;
    const update = () => setRunning(visible && document.visibilityState === 'visible');
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      update();
    });
    io.observe(el);
    document.addEventListener('visibilitychange', update);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const onLost = useCallback(() => setMode('poster'), []);
  const onReady = useCallback(() => setReady(true), []);
  const live = mode === 'webgl-high' || mode === 'webgl-low';

  return (
    <div ref={ref} className="now-sky" aria-hidden="true">
      {(!live || !ready) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dusk ? '/story/ch1.webp' : '/story/ch7.webp'} alt="" decoding="async" />
      )}
      {live && (
        <NowSkyScene
          mode={mode}
          smog={smogForLevel(level)}
          dusk={dusk}
          running={running}
          onLost={onLost}
          onReady={onReady}
        />
      )}
    </div>
  );
}
