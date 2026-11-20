'use client';

import { LangSwitch } from '@/components/shell/LangSwitch';
import { t } from '@/lib/i18n';
import { story } from '@/lib/story/strings';
import { withLang } from '@/lib/page';
import type { Lang } from '@/lib/types';
import css from './chrome.module.css';

// Slim fixed bar: brand, language, and a way out to the live forecast at any moment of the pitch.
export function TopBar({ lang, forecastHref }: { lang: Lang; forecastHref: string }) {
  return (
    <header className={css.bar}>
      <a className={css.brand} href="#ch-1">
        <span className={css.mark} aria-hidden="true" />
        {story(lang, 'ch1.title')}
      </a>
      <div className={css.barEnd}>
        <LangSwitch lang={lang} label={t(lang, 'lang.label')} names={{ bg: t(lang, 'lang.bg'), en: t(lang, 'lang.en') }} />
        <a className={css.live} href={withLang(forecastHref, lang)}>
          {story(lang, 'bar.live')}
        </a>
      </div>
    </header>
  );
}
