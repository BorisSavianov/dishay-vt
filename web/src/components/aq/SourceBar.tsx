import { sourceSegments, sourcesLine } from '@/lib/aq/sources';
import { air } from '@/lib/aq/strings';
import type { AqSources } from '@/lib/aq/types';
import type { Lang } from '@/lib/types';

// „Кой замърсява?“: the four estimated shares as one bar, and the same three as words. Colour never says it
// alone: the words carry the numbers, and „друго“ is in the hover text of its segment.
export function SourceBar({ sources, lang }: { sources: AqSources; lang: Lang }) {
  const segments = sourceSegments(sources, lang).filter((s) => s.share > 0);
  return (
    <div className="src">
      <div className="src-bar" role="img" aria-label={`${air(lang, 'src.bar.alt')}: ${sourcesLine(sources, lang)}`}>
        {segments.map((s) => (
          <span key={s.key} className={`src-seg is-${s.key}`} style={{ width: `${s.share * 100}%` }} title={`${s.label} ${Math.round(s.share * 100)}%`} />
        ))}
      </div>
      <p className="src-line">{sourcesLine(sources, lang)}</p>
    </div>
  );
}
