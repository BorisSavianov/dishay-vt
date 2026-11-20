'use client';

import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

// Headline line reveals ([data-split]), card fades ([data-reveal]) and the chapter 5 HTML bars ([data-bar]).
export function useReveals(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const ctx = gsap.context(() => {
      document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
        const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'story-line' });
        gsap.from(split.lines, {
          yPercent: 110,
          duration: 1.1,
          stagger: 0.08,
          ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none reverse' },
        });
      });
      document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          y: 40,
          autoAlpha: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' },
        });
      });
      document.querySelectorAll<HTMLElement>('[data-bar]').forEach((el, i) => {
        gsap.from(el, {
          scaleX: 0,
          duration: 1.4,
          delay: i * 0.15,
          ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' },
        });
      });
    });
    return () => ctx.revert();
  }, [enabled]);
}
