import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import { t, type MessageKey } from '@/lib/i18n';
import { langOf, type SearchParams } from '@/lib/page';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: `${t(lang, 'nav.about')} · ${t(lang, 'brand.name')}` };
}

export default async function About({ searchParams }: { searchParams: SearchParams }) {
  const lang = langOf(await searchParams);
  const tr = (key: MessageKey) => t(lang, key);

  return (
    <AppShell lang={lang} active="about" title={tr('nav.about')}>
      <article className="card prose">
        <h2>{tr('about.what.title')}</h2>
        <p>{tr('about.what.body')}</p>
        <h2>{tr('about.method.title')}</h2>
        <ul>
          <li>{tr('about.method.change')}</li>
          <li>{tr('about.method.cagr')}</li>
        </ul>
        <h2>{tr('about.ai.title')}</h2>
        <p>{tr('about.ai.body')}</p>
        <h2>{tr('about.limits.title')}</h2>
        <ul>
          <li>{tr('about.limits.physicians')}</li>
          <li>{tr('map.caveat')}</li>
          <li>{tr('about.limits.gaps')}</li>
        </ul>
      </article>
    </AppShell>
  );
}
