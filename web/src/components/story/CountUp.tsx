'use client';

import { useEffect, useRef } from 'react';

// Counts from 0 to the value once it scrolls into view. The server-rendered text is the final value,
// so without JavaScript (or with reduced motion) the number is simply there.
export function CountUp({ to, format, className }: { to: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        // Poster mode shows the story still: the number stays at its final value.
        if (document.documentElement.dataset.storyMode === 'poster') return;
        const t0 = performance.now();
        const step = (t: number) => {
          const k = Math.min(1, (t - t0) / 1600);
          const eased = 1 - Math.pow(1 - k, 4);
          el.textContent = format(to * eased);
          if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, format]);
  return (
    <span ref={ref} className={className}>
      {format(to)}
    </span>
  );
}
