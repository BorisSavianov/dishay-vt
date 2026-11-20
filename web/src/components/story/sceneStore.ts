// Shared, mutable story state. The scroll hook writes it; the 3D scene reads it every frame without React re-renders.
// React components that only need the chapter number subscribe through useChapter().
import { useSyncExternalStore } from 'react';
import { chapterOf, sceneAt, type SceneState } from '@/lib/story/timeline';

type Store = { p: number; state: SceneState; chapter: number };

export const sceneStore: Store = { p: 0, state: sceneAt(0), chapter: 1 };

const listeners = new Set<() => void>();

export function setProgress(p: number): void {
  sceneStore.p = p;
  sceneStore.state = sceneAt(p);
  const chapter = chapterOf(p);
  if (chapter !== sceneStore.chapter) {
    sceneStore.chapter = chapter;
    for (const l of listeners) l();
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useChapter(): number {
  return useSyncExternalStore(
    subscribe,
    () => sceneStore.chapter,
    () => 1,
  );
}
