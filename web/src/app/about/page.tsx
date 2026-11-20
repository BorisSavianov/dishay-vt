import type { Metadata } from 'next';
import Link from 'next/link';
import { LevelChip } from '@/components/aq/Level';
import { AppShell } from '@/components/shell/AppShell';
import { Icon } from '@/components/shell/Icon';
import { fmtPm } from '@/lib/aq/format';
import { PM10_BANDS, PM25_BANDS } from '@/lib/aq/levels';
import { air, type AirKey } from '@/lib/aq/strings';
import { t } from '@/lib/i18n';
import { langOf, withLang, type SearchParams } from '@/lib/page';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: `${t(lang, 'nav.about')} · ${t(lang, 'brand.name')}`, description: air(lang, 'm.lead') };
}

const LEVELS = [1, 2, 3, 4, 5, 6] as const;

export default async function About({ searchParams }: { searchParams: SearchParams }) {
  const lang = langOf(await searchParams);
  const tr = (key: AirKey, vars?: Record<string, string | number>) => air(lang, key, vars);
  const pm = (n: number) => fmtPm(lang, n);
  const edge = (bands: readonly number[], i: number) =>
    i < bands.length ? pm(bands[i]!) : tr('m.levels.above', { n: pm(bands[bands.length - 1]!) });

  return (
    <AppShell lang={lang} active="about" title={t(lang, 'nav.about')} lead={tr('m.lead')}>
      <div className="row-split">
        <article className="card prose">
          <h2>{tr('m.what.title')}</h2>
          <p>{tr('m.what.body')}</p>
          <h2>{tr('m.data.title')}</h2>
          <ul>
            <li>{tr('m.data.1')}</li>
            <li>{tr('m.data.2')}</li>
            <li>{tr('m.data.3')}</li>
            <li>{tr('m.data.4')}</li>
          </ul>
          <h2>{tr('m.model.title')}</h2>
          <ul>
            <li>{tr('m.model.1')}</li>
            <li>{tr('m.model.2')}</li>
            <li>{tr('m.model.3')}</li>
          </ul>
          <h2>{tr('m.test.title')}</h2>
          <p>{tr('m.test.body')}</p>
          <p>
            <Link className="btn" href={withLang('/why', lang)}>
              {tr('m.test.link')}
              <Icon name="arrow" />
            </Link>
          </p>
        </article>

        <div className="stack">
          <section className="card prose" aria-labelledby="levels-title">
            <h2 id="levels-title">{tr('m.levels.title')}</h2>
            <p>{tr('m.levels.body')}</p>
            <div className="table-wrap">
              <table className="table levels-table">
                <thead>
                  <tr>
                    <th scope="col">{tr('m.levels.col.level')}</th>
                    <th scope="col">{tr('m.levels.col.pm25')}</th>
                    <th scope="col">{tr('m.levels.col.pm10')}</th>
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map((l, i) => (
                    <tr key={l}>
                      <th scope="row">
                        <LevelChip level={l} lang={lang} />
                      </th>
                      <td>{edge(PM25_BANDS, i)}</td>
                      <td>{edge(PM10_BANDS, i)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>{tr('m.alerts.body')}</p>
          </section>

          <section className="card prose" aria-labelledby="ai-title">
            <h2 id="ai-title">{tr('m.ai.title')}</h2>
            <p>{tr('m.ai.body')}</p>
            <h2>{tr('m.limits.title')}</h2>
            <ul>
              <li>{tr('m.limits.1')}</li>
              <li>{tr('m.limits.2')}</li>
              <li>{tr('m.limits.3')}</li>
              <li>{tr('m.limits.4')}</li>
              <li>{tr('m.limits.5')}</li>
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
