'use client';

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { StoryData } from '@/lib/story/facts';
import { ProgressRail } from './ProgressRail';
import { useStoryScroll } from './useStoryScroll';
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
  const { goTo } = useStoryScroll(reduced);
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
