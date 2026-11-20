'use client';

import { CHAPTERS } from '@/lib/story/timeline';
import { story } from '@/lib/story/strings';
import type { Lang } from '@/lib/types';
import { useChapter } from './sceneStore';
import css from './chrome.module.css';

export function ProgressRail({ lang, goTo }: { lang: Lang; goTo: (n: number) => void }) {
  const chapter = useChapter();
  return (
    <nav className={`${css.rail} ${chapter >= 7 ? css.day : ''}`} aria-label={story(lang, 'rail.label')}>
      {Array.from({ length: CHAPTERS }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={css.dot}
          aria-label={story(lang, 'rail.go', { n })}
          aria-current={n === chapter ? 'step' : undefined}
          onClick={() => goTo(n)}
        />
      ))}
    </nav>
  );
}
