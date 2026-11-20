import { Screen } from '../components/Screen';
import { sourceText } from '../components/SourceLine';
import { SummaryCard } from '../components/SummaryCard';
import { bundled } from '../lib/data';
import { useLang } from '../lib/lang';
import { t, type MessageKey } from '../shared/i18n';
import { updatedAt } from '../shared/metrics';
import type { DatasetName } from '../shared/types';

const DATASET_NAMES: DatasetName[] = ['population', 'physicians', 'facilities'];

export default function Insights() {
  const { lang } = useLang();
  const tr = (key: MessageKey) => t(lang, key);
  return (
    <Screen title={tr('nav.ai')} lead={tr('ai.lead')} updated={updatedAt(bundled)}>
      {DATASET_NAMES.map((name) => (
        <SummaryCard
          key={`${name}-${lang}`}
          dataset={name}
          lang={lang}
          title={tr(`summary.card.${name}` as MessageKey)}
          source={sourceText(bundled[name].meta, tr('sources.asof'), tr('sources.license'))}
        />
      ))}
    </Screen>
  );
}
