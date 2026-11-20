import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import { SummaryCard, type SummaryLabels } from '@/components/SummaryCard';
import { loadDatasets } from '@/lib/data';
import { t, type MessageKey } from '@/lib/i18n';
import { updatedAt } from '@/lib/metrics';
import { langOf, type SearchParams } from '@/lib/page';
import { sourceLine } from '@/lib/sources';
import type { DatasetName } from '@/lib/types';

export const revalidate = 300;

const DATASET_NAMES: DatasetName[] = ['population', 'physicians', 'facilities'];

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: `${t(lang, 'nav.ai')} · ${t(lang, 'brand.name')}`, description: t(lang, 'ai.lead') };
}

export default async function Insights({ searchParams }: { searchParams: SearchParams }) {
  const lang = langOf(await searchParams);
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const { source, datasets } = await loadDatasets();

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
    <AppShell
      lang={lang}
      active="ai"
      title={tr('nav.ai')}
      lead={tr('ai.lead')}
      updated={updatedAt(datasets)}
      bundled={source === 'bundled'}
    >
      <div className="summary-grid">
        {DATASET_NAMES.map((name) => (
          <SummaryCard
            key={name}
            dataset={name}
            lang={lang}
            title={tr(`summary.card.${name}` as MessageKey)}
            labels={labels}
            source={sourceLine(lang, datasets[name].meta)}
          />
        ))}
      </div>
    </AppShell>
  );
}
