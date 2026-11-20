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
      document.querySelectorAll<HTMLElement>('[data-phone]').forEach((el) => {
        gsap.from(el, {
          rotateX: 18,
          y: 60,
          autoAlpha: 0,
          transformPerspective: 1200,
          duration: 1.3,
          ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' },
        });
      });
      // The episode chart draws itself: observed, then our forecast, then CAMS.
      document.querySelectorAll<HTMLElement>('[data-draw]').forEach((el) => {
        const paths = el.querySelectorAll<SVGPathElement>('path.ep-observed, path.ep-forecast, path.ep-cams');
        paths.forEach((p, i) => {
          const len = p.getTotalLength();
          gsap.fromTo(
            p,
            { strokeDasharray: len, strokeDashoffset: len },
            {
              strokeDashoffset: 0,
              duration: 1.8,
              delay: 0.25 + i * 0.25,
              ease: 'power2.inOut',
              clearProps: 'strokeDasharray,strokeDashoffset',
              scrollTrigger: { trigger: el, start: 'top 80%', toggleActions: 'play none none reverse' },
            },
          );
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
