'use client';

import { CHAPTERS } from '@/lib/story/timeline';
import { useChapter } from './sceneStore';
import css from './story.module.css';

// Still frames of the 3D scene, one per chapter, behind the same text cards.
// Shown while the device is probed, without WebGL2, with reduced motion, or after a lost context.
export function Fallback() {
  const chapter = useChapter();
  return (
    <div className={css.posters} aria-hidden="true">
      {Array.from({ length: CHAPTERS }, (_, i) => i + 1)
        // Only the current chapter and its neighbours load: every poster sits in the viewport, so lazy loading would not help.
        .filter((n) => Math.abs(n - chapter) <= 1)
        .map((n) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={n} src={`/story/ch${n}.webp`} alt="" decoding="async" data-on={n === chapter ? '' : undefined} />
        ))}
    </div>
  );
}
