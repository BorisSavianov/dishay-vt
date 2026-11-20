// Shared, mutable story state. The scroll hook writes it; the 3D scene reads it every frame without React re-renders.
// React components that only need the chapter number subscribe through useChapter().
import { useSyncExternalStore } from 'react';
import { chapterOf, sceneAt, type SceneState } from '@/lib/story/timeline';

// smog = the effective smog for shaders: the scene's smog, shaped by the real 18.12 hourly PM10 during chapter 2.
type Store = { p: number; state: SceneState; chapter: number; smog: number; smogShape: (s: SceneState) => number };

export const sceneStore: Store = { p: 0, state: sceneAt(0), chapter: 1, smog: 0, smogShape: (s) => s.smog };

const listeners = new Set<() => void>();

export function setProgress(p: number): void {
  sceneStore.p = p;
  sceneStore.state = sceneAt(p);
  sceneStore.smog = sceneStore.smogShape(sceneStore.state);
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
