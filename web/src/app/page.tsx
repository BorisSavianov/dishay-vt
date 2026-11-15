import { DotMap } from '@/components/DotMap';
import { LineChart } from '@/components/LineChart';
import { Sources } from '@/components/Sources';
import { StatCard } from '@/components/StatCard';
import { SummaryCard, type SummaryLabels } from '@/components/SummaryCard';
import { loadDatasets } from '@/lib/data';
import { changePct, fmtInt, fmtNum, fmtPct } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import type { DatasetName, Lang } from '@/lib/types';

export const revalidate = 300;

const DATASET_NAMES: DatasetName[] = ['population', 'physicians', 'facilities'];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const params = await searchParams;
  const lang: Lang = params.lang === 'en' ? 'en' : 'bg';
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);

  const { source, datasets } = await loadDatasets();
  const pop = datasets.population.series;
  const first = pop[0]!;
  const last = pop[pop.length - 1]!;
  const pct = changePct(first.value, last.value);
  const phys = datasets.physicians.series[datasets.physicians.series.length - 1];
  const facilities = datasets.facilities;
  const facilityTotal = Object.values(facilities.counts).reduce((a, b) => a + b, 0);

  const labels: SummaryLabels = {
    button: tr('summary.button'),
    loading: tr('summary.loading'),
    error: tr('summary.error'),
    cached: tr('summary.cached'),
    provider: {
      groq: tr('summary.provider.groq'),
      gemini: tr('summary.provider.gemini'),
      mock: tr('summary.provider.mock'),
    },
  };

  return (
    <main lang={lang}>
      <header>
        <h1>{tr('site.title')}</h1>
        <p>{tr('site.lead')}</p>
        <nav aria-label={tr('lang.label')}>
          <a href="?lang=bg" hrefLang="bg" aria-current={lang === 'bg' ? 'page' : undefined}>
            {tr('lang.bg')}
          </a>{' '}
          ·{' '}
          <a href="?lang=en" hrefLang="en" aria-current={lang === 'en' ? 'page' : undefined}>
            {tr('lang.en')}
          </a>
        </nav>
      </header>

      {source === 'bundled' && <p className="notice">{tr('notice.bundled')}</p>}

      <section className="stats" aria-label={tr('site.title')}>
        <StatCard
          label={tr('stat.population.label', { year: last.year })}
          value={fmtInt(lang, last.value)}
          sub={tr('stat.population.sub', { first: first.year, pct: fmtPct(lang, pct) })}
        />
        {phys && (
          <StatCard
            label={tr('stat.physicians.label')}
            value={fmtNum(lang, phys.value, 2)}
            sub={tr('stat.physicians.sub', { year: phys.year })}
          />
        )}
        <StatCard
          label={tr('facilities.total.label')}
          value={fmtInt(lang, facilityTotal)}
          sub={tr('facilities.total.sub')}
        />
      </section>

      <section>
        <h2>{tr('chart.population.title')}</h2>
        <LineChart
          series={pop}
          lang={lang}
          title={tr('chart.population.title')}
          alt={tr('chart.population.alt', { first: first.year, last: last.year })}
        />
      </section>

      <section>
        <h2>{tr('facilities.title')}</h2>
        <DotMap points={facilities.points} counts={facilities.counts} lang={lang} alt={tr('facilities.map.alt')} />
        <p className="caveat">{tr('facilities.caveat')}</p>
      </section>

      <section>
        <h2>{tr('summary.title')}</h2>
        <p>{tr('summary.intro')}</p>
        {DATASET_NAMES.map((name) => (
          <SummaryCard
            key={name}
            dataset={name}
            lang={lang}
            title={tr(`summary.card.${name}` as MessageKey)}
            labels={labels}
          />
        ))}
      </section>

      <Sources
        metas={[datasets.population.meta, datasets.physicians.meta, datasets.facilities.meta]}
        title={tr('sources.title')}
        asOf={tr('sources.asof')}
        licence={tr('sources.license')}
      />
    </main>
  );
}
