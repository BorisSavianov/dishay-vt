'use client';

import { useCallback, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { CHAPTERS, chapterTarget, progressFromSections } from '@/lib/story/timeline';
import { sceneStore, setProgress } from './sceneStore';

gsap.registerPlugin(ScrollTrigger);

const TYPING = 'input, textarea, select, [contenteditable="true"]';
const ACTIVATES = 'a, button, summary, [role="button"]';

function sectionTops(): { tops: number[]; end: number } {
  const tops: number[] = [];
  let end = 0;
  for (let n = 1; n <= CHAPTERS; n++) {
    const el = document.getElementById(`ch-${n}`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    tops.push(r.top + window.scrollY);
    end = r.bottom + window.scrollY;
  }
  return { tops, end };
}

// Smooth scroll (Lenis, unless reduced motion), scroll → story progress, and presenter keys.
export function useStoryScroll(reducedMotion: boolean): { goTo: (n: number) => void } {
  const lenisRef = useRef<Lenis | null>(null);

  const goTo = useCallback(
    (n: number) => {
      const el = document.getElementById(`ch-${n}`);
      if (!el) return;
      if (lenisRef.current) lenisRef.current.scrollTo(el, { duration: 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
      else el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    },
    [reducedMotion],
  );

  useEffect(() => {
    let layout = sectionTops();
    const update = () => setProgress(progressFromSections(window.scrollY + window.innerHeight / 2, layout.tops, layout.end));
    const relayout = () => {
      layout = sectionTops();
      update();
      ScrollTrigger.refresh();
    };

    let lenis: Lenis | null = null;
    let tick: ((time: number) => void) | null = null;
    if (!reducedMotion) {
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
      lenisRef.current = lenis;
      lenis.on('scroll', () => {
        ScrollTrigger.update();
        update();
      });
      tick = (time: number) => lenis!.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }
    window.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(relayout);
    ro.observe(document.body);
    update();

    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const active = document.activeElement;
      if (active?.closest(TYPING)) return;
      if ((e.key === ' ' || e.key === 'Enter') && active?.closest(ACTIVATES)) return;
      const to = chapterTarget(sceneStore.chapter, e.key, e.shiftKey);
      if (to === null) {
        // At either end, swallow the step keys so the page does not drift past the last chapter.
        if ([' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp'].includes(e.key)) e.preventDefault();
        return;
      }
      e.preventDefault();
      goTo(to);
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', update);
      ro.disconnect();
      if (tick) gsap.ticker.remove(tick);
      lenis?.destroy();
      lenisRef.current = null;
    };
  }, [reducedMotion, goTo]);

  return { goTo };
}
