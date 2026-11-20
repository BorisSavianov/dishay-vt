'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { Lang } from '@/lib/types';

// Bulgarian | English. Each link keeps the current page and sets ?lang=.
export function LangSwitch({ lang, label, names }: { lang: Lang; label: string; names: Record<Lang, string> }) {
  const pathname = usePathname();
  return (
    <nav className="seg" aria-label={label}>
      {(['bg', 'en'] as const).map((code) => (
        <a
          key={code}
          href={`${pathname}?lang=${code}`}
          hrefLang={code}
          lang={code}
          aria-current={lang === code ? 'page' : undefined}
          aria-label={names[code]}
        >
          {code.toUpperCase()}
        </a>
      ))}
    </nav>
  );
}

// The document language follows the page language, so screen readers pronounce English pages correctly.
export function DocLang({ lang }: { lang: Lang }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
