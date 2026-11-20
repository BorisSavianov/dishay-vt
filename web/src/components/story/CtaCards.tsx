'use client';

import { useEffect, useRef } from 'react';
import { story } from '@/lib/story/strings';
import { withLang } from '@/lib/page';
import type { Lang } from '@/lib/types';
import css from './story.module.css';

export const TELEGRAM_URL = 'https://t.me/dishay_vt_bot?start=jury';

// Chapter 8: the live forecast, the Telegram bot and the app.
export function CtaCards({ lang, forecastHref }: { lang: Lang; forecastHref: string }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) void v.play().catch(() => undefined);
      else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <div className={css.cta}>
      <a className={css.primary} href={withLang(forecastHref, lang)}>
        {story(lang, 'ch8.forecast')} →
      </a>
      <div className={css.ctaGrid}>
        <a className={css.ctaCard} href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={css.qr} src="/story/telegram_qr.svg" alt="" width={140} height={140} />
          <b>{story(lang, 'ch8.telegram')}</b>
          <span>{story(lang, 'ch8.telegramHint')} · @dishay_vt_bot</span>
        </a>
        <figure className={css.ctaCard}>
          <div className={css.miniPhone}>
            <video ref={video} src="/story/app-alert.mp4" poster="/story/app-alert.jpg" muted loop playsInline preload="none" aria-hidden="true" />
          </div>
          <figcaption>
            <b>{story(lang, 'ch8.app')}</b>
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
