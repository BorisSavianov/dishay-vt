'use client';

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { StoryData } from '@/lib/story/facts';
import { ProgressRail } from './ProgressRail';
import { useStoryScroll } from './useStoryScroll';
import { useReveals } from './useReveals';
import { sceneStore, setProgress } from './sceneStore';
import { smogDensity } from '@/lib/story/smog';
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

// The client island: scroll engine, chapter rail, and (later) the 3D scene behind the server-rendered chapters.
export function StoryClient({ data, children }: { data: StoryData; children: ReactNode }) {
  const reduced = usePrefersReducedMotion();
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
  useReveals(!reduced);
  return (
    <>
      <div className={css.layer}>
        <StoryScene data={data} tier="high" />
      </div>
      {children}
      <ProgressRail lang={data.lang} goTo={goTo} />
    </>
  );
}
