import Link from 'next/link';
import type { ReactNode } from 'react';
import { fmtDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n';
import { withLang } from '@/lib/page';
import type { Lang } from '@/lib/types';
import { ExportMenu } from './ExportMenu';
import { BrandMark, Icon, type IconName } from './Icon';
import { DocLang, LangSwitch } from './LangSwitch';
import { ThemeToggle } from './ThemeToggle';

export type NavId = 'dashboard' | 'geo' | 'why' | 'health' | 'ai' | 'predict' | 'sources' | 'about';

type NavItem = { id: NavId; href: string; label: MessageKey; tab?: MessageKey; icon: IconName };

const GROUPS: { label: MessageKey; items: NavItem[] }[] = [
  {
    label: 'nav.overview',
    items: [
      { id: 'dashboard', href: '/', label: 'nav.dashboard', tab: 'tab.dashboard', icon: 'home' },
      { id: 'geo', href: '/geographic', label: 'nav.geo', tab: 'tab.map', icon: 'map' },
      { id: 'why', href: '/why', label: 'nav.why', icon: 'trendDown' },
      { id: 'health', href: '/health', label: 'nav.health', tab: 'tab.health', icon: 'heart' },
      { id: 'ai', href: '/insights', label: 'nav.ai', tab: 'tab.ai', icon: 'sparkle' },
      { id: 'predict', href: '/predict', label: 'nav.predict', tab: 'tab.predict', icon: 'activity' },
    ],
  },
  {
    label: 'nav.data',
    items: [
      { id: 'sources', href: '/sources', label: 'nav.sources', tab: 'tab.data', icon: 'database' },
      { id: 'about', href: '/about', label: 'nav.about', icon: 'info' },
    ],
  },
];

const EXPORTS = [
  { name: 'population', label: 'export.population' },
  { name: 'physicians', label: 'export.physicians' },
  { name: 'facilities', label: 'export.facilities' },
] as const;

export function AppShell({
  lang,
  active,
  title,
  lead,
  updated,
  bundled = false,
  exportable = false,
  children,
}: {
  lang: Lang;
  active: NavId;
  title: string;
  lead?: string;
  updated?: string | null;
  bundled?: boolean;
  exportable?: boolean;
  children: ReactNode;
}) {
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const names = { bg: tr('lang.bg'), en: tr('lang.en') };
  const controls = (
    <>
      <LangSwitch lang={lang} label={tr('lang.label')} names={names} />
      <ThemeToggle label={tr('theme.toggle')} toLight={tr('theme.light')} toDark={tr('theme.dark')} />
    </>
  );
  const brand = (
    <Link className="brand" href={withLang('/', lang)}>
      <BrandMark />
      <span>{tr('brand.name')}</span>
    </Link>
  );

  return (
    <div className="app">
      <DocLang lang={lang} />
      <a className="skip-link" href="#main">
        {tr('skip.link')}
      </a>

      <aside className="sidebar">
        {brand}
        <nav aria-label={tr('nav.label')}>
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="side-label">{tr(group.label)}</p>
              <ul className="side-nav">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link href={withLang(item.href, lang)} aria-current={active === item.id ? 'page' : undefined}>
                      <Icon name={item.icon} />
                      {tr(item.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="side-spacer" />
        <p className="location">
          <Icon name="pin" />
          {tr('location.name')}
        </p>
      </aside>

      <div className="main-col">
        <div className="mobile-bar">
          {brand}
          <div className="head-actions">{controls}</div>
        </div>

        <main id="main" className="page" lang={lang}>
          <header className="page-head">
            <div>
              <p className="eyebrow">{tr('brand.tagline')}</p>
              <h1 className="page-title">{title}</h1>
              {lead && <p className="page-lead">{lead}</p>}
            </div>
            <div className="head-actions">
              {updated && (
                <span className="pill">
                  <Icon name="refresh" />
                  {tr('updated.label', { date: fmtDate(lang, updated) })}
                </span>
              )}
              {exportable && (
                <ExportMenu
                  label={tr('export.button')}
                  items={EXPORTS.map((e) => ({ href: `/api/export/${e.name}`, label: tr(e.label) }))}
                />
              )}
              <div className="only-wide head-actions">{controls}</div>
            </div>
          </header>
          {bundled && (
            <p className="notice" role="status">
              {tr('notice.bundled')}
            </p>
          )}
          {children}
        </main>
      </div>

      <nav className="tabbar" aria-label={tr('nav.label')}>
        {GROUPS.flatMap((g) => g.items)
          .filter((item) => item.tab)
          .map((item) => (
            <Link key={item.id} href={withLang(item.href, lang)} aria-current={active === item.id ? 'page' : undefined}>
              <Icon name={item.icon} />
              {tr(item.tab!)}
            </Link>
          ))}
      </nav>
    </div>
  );
}
