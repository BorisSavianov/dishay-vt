'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { StoryData } from '@/lib/story/facts';
import { detectMode, probeEnv, type StoryMode } from '@/lib/story/mode';
import { smogDensity } from '@/lib/story/smog';
import { Fallback } from './Fallback';
import { ProgressRail } from './ProgressRail';
import { useStoryScroll } from './useStoryScroll';
import { useReveals } from './useReveals';
import { sceneStore, setProgress } from './sceneStore';
import css from './story.module.css';

const StoryScene = dynamic(() => import('./StoryScene'), { ssr: false });

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

// Development-only switches: ?story=poster forces the fallback, ?story=capture keeps the WebGL drawing buffer
// so the posters can be captured from the canvas.
function devFlag(): string | null {
  if (process.env.NODE_ENV !== 'development') return null;
  return new URLSearchParams(window.location.search).get('story');
}

// The client island: scroll engine, chapter rail, and the 3D scene (or its posters) behind the server-rendered chapters.
export function StoryClient({ data, children }: { data: StoryData; children: ReactNode }) {
  const reduced = usePrefersReducedMotion();
  // null while the device is probed: the posters show, so the first paint is never an empty canvas.
  const [mode, setMode] = useState<StoryMode | null>(null);
  const [capture, setCapture] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    const flag = devFlag();
    setCapture(flag === 'capture');
    setMode(flag === 'poster' ? 'poster' : detectMode(probeEnv()));
  }, []);

  // Reduced motion switched on mid-story: drop to posters.
  useEffect(() => {
    if (reduced) setMode('poster');
  }, [reduced]);

  useEffect(() => {
    if (mode) document.documentElement.dataset.storyMode = mode;
  }, [mode]);

  // Chapter 2's smog follows the real hourly PM10 of 18.12.2025; elsewhere it is the scene's own level.
  useEffect(() => {
    const hourly = data.episodeHourly;
    sceneStore.smogShape = (s) => {
      const w = Math.max(0, 1 - Math.abs(sceneStore.p - 1.5 / 8) / (0.6 / 8));
      return s.smog * (1 - w + w * (0.15 + 0.85 * smogDensity(hourly, s.episodeHour)));
    };
    setProgress(sceneStore.p);
  }, [data.episodeHourly]);

  const { goTo } = useStoryScroll(reduced);
  const live = mode === 'webgl-high' || mode === 'webgl-low';
  useReveals(live && !reduced);

  const onLost = useCallback(() => setMode('poster'), []);
  const onReady = useCallback(() => setSceneReady(true), []);

  return (
    <>
      {(!live || !sceneReady) && <Fallback />}
      {live && (
        <div className={css.layer}>
          <StoryScene data={data} mode={mode} capture={capture} onLost={onLost} onReady={onReady} />
        </div>
      )}
      {children}
      <ProgressRail lang={data.lang} goTo={goTo} />
    </>
  );
}
