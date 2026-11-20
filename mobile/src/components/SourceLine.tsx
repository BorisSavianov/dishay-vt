import { Text, View } from 'react-native';
import { useColors } from '../lib/color-mode';
import type { Meta } from '../shared/types';

// One source and licence line, worded as on the web page. Shown under every data view.
export function sourceText(meta: Meta, asOf: string, licence: string): string {
  return `${meta.source}. ${asOf} ${meta.as_of}. ${licence} ${meta.license}`;
}

export function SourceLine({ meta, asOf, licence }: { meta: Meta; asOf: string; licence: string }) {
  const c = useColors();
  return <Text style={{ fontSize: 12, lineHeight: 17, color: c.muted }}>{sourceText(meta, asOf, licence)}</Text>;
}

// The full list of sources, one line per distinct source, at the foot of a screen.
export function SourcesList({
  metas,
  title,
  asOf,
  licence,
}: {
  metas: Meta[];
  title: string;
  asOf: string;
  licence: string;
}) {
  const c = useColors();
  const seen = new Map<string, Meta>();
  for (const m of metas) if (!seen.has(m.source)) seen.set(m.source, m);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: c.fg }}>{title}</Text>
      {[...seen.values()].map((m) => (
        <SourceLine key={m.source} meta={m} asOf={asOf} licence={licence} />
      ))}
    </View>
  );
}
