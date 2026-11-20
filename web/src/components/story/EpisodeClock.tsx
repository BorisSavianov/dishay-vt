'use client';

import { useEffect, useRef } from 'react';
import { fmtNum, story } from '@/lib/story/strings';
import type { StoryHour } from '@/lib/story/facts';
import type { Lang } from '@/lib/types';
import { sceneStore } from './sceneStore';
import css from './story.module.css';

// The 18.12 clock and the hourly PM10, driven by scroll. Writes text directly: no React render per frame.
export function EpisodeClock({ lang, hourly }: { lang: Lang; hourly: StoryHour[] }) {
  const clock = useRef<HTMLSpanElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastHour = -1;
    const peak = Math.max(1, ...hourly.map((h) => h.pm10));
    const loop = () => {
      const h = Math.min(23, Math.max(0, Math.floor(sceneStore.state.episodeHour)));
      if (h !== lastHour && hourly[h]) {
        lastHour = h;
        if (clock.current) clock.current.textContent = story(lang, 'ch2.clock', { hour: String(h).padStart(2, '0') });
        if (value.current) value.current.textContent = story(lang, 'ch2.hourly', { value: fmtNum(lang, hourly[h]!.pm10, 1) });
        if (bar.current) {
          bar.current.style.transform = `scaleX(${hourly[h]!.pm10 / peak})`;
          bar.current.dataset.over = hourly[h]!.pm10 > 50 ? 'true' : 'false';
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [lang, hourly]);

  if (hourly.length === 0) return null;
  return (
    <div className={css.clock} aria-hidden="true">
      <span ref={clock} className={css.clockTime}>
        {story(lang, 'ch2.clock', { hour: '00' })}
      </span>
      <span ref={value} className={css.clockValue}>
        {story(lang, 'ch2.hourly', { value: fmtNum(lang, hourly[0]!.pm10, 1) })}
      </span>
      <span className={css.clockTrack}>
        <span ref={bar} className={css.clockBar} />
      </span>
    </div>
  );
}
