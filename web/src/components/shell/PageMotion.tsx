'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { formatCount, parseCount } from '@/lib/look';

gsap.registerPlugin(ScrollTrigger);

// The story's motion, toned down for a tool: cards below the first screen rise in once, [data-count] numbers count
// up once, and the accuracy bars grow. The server text is final, so without JS or with reduced motion nothing moves.
export function PageMotion() {
  const path = usePathname();
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fold = window.innerHeight;
    const timers: number[] = [];
    const once = (el: Element) => ({ trigger: el, start: 'top 90%', once: true });
    const ctx = gsap.context(() => {
      // Cards already on screen stay put, so nothing visible blinks on load.
      document.querySelectorAll<HTMLElement>('.page .card').forEach((el) => {
        if (el.getBoundingClientRect().top < fold) return;
        gsap.from(el, { y: 24, autoAlpha: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: once(el) });
      });
      // Nothing is written until the number scrolls into view, so the server's final text shows until then.
      document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
        const spec = parseCount(el.textContent ?? '');
        if (!spec) return;
        const final = () => void (el.textContent = formatCount(spec, spec.value));
        ScrollTrigger.create({
          trigger: el,
          start: 'top 90%',
          once: true,
          onEnter: () => {
            const n = { v: 0 };
            gsap.to(n, {
              v: spec.value,
              duration: 0.9,
              ease: 'power2.out',
              onUpdate: () => void (el.textContent = formatCount(spec, n.v)),
              onComplete: final,
            });
            // If frames stall (a throttled tab), the number must not stay wrong: write the final value regardless.
            timers.push(window.setTimeout(final, 1600));
          },
        });
      });
      document.querySelectorAll<HTMLElement>('.mae-bars .bar').forEach((el) => {
        gsap.from(el, { scaleX: 0, transformOrigin: 'left center', duration: 1, ease: 'expo.out', scrollTrigger: once(el) });
      });
    });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      ctx.revert();
    };
  }, [path]);
  return null;
}
