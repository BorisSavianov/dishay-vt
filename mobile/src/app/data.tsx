import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, CardTitle } from '../components/Card';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { useColors } from '../lib/color-mode';
import { bundled, bundledRegion } from '../lib/data';
import { useLang } from '../lib/lang';
import { fmtInt } from '../shared/format';
import { t, type MessageKey } from '../shared/i18n';
import { regionCaveat } from '../shared/pin';
import { span, updatedAt } from '../shared/metrics';
import type { DatasetName } from '../shared/types';

const DATASET_NAMES: DatasetName[] = ['population', 'physicians', 'facilities'];

export default function Data() {
  const { lang } = useLang();
  const c = useColors();
  const router = useRouter();
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);

  const popSpan = span(bundled.population.series);
  const physSpan = span(bundled.physicians.series);
  const coverage: Record<DatasetName, string> = {
    population: popSpan ? tr('sources.coverage.population', { first: popSpan.first.year, last: popSpan.last.year }) : '',
    physicians: physSpan ? tr('sources.coverage.physicians', { first: physSpan.first.year, last: physSpan.last.year }) : '',
    facilities: tr('sources.coverage.facilities', { count: fmtInt(lang, bundled.facilities.points.length) }),
  };

  return (
    <Screen title={tr('nav.sources')} lead={tr('sources.lead')} updated={updatedAt(bundled)}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          router.navigate('/predict');
        }}
        accessibilityRole="link"
        accessibilityLabel={`${tr('nav.predict')}. ${tr('predict.lead')}`}
        style={({ pressed }) => [styles.link, { backgroundColor: c.accentSoft }, pressed && { opacity: 0.8 }]}
      >
        <Icon name="activity" color={c.accentStrong} size={22} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.linkTitle, { color: c.fg }]}>{tr('predict.title')}</Text>
          <Text style={[styles.body, { color: c.muted }]}>{tr('predict.lead')}</Text>
        </View>
        <Icon name="arrow" color={c.accentStrong} size={20} />
      </Pressable>
      {DATASET_NAMES.map((name) => {
        const meta = bundled[name].meta;
        return (
          <Card key={name}>
            <CardTitle title={tr(`summary.card.${name}` as MessageKey)} />
            <Row label={tr('sources.col.source')} value={meta.source} />
            <Row label={tr('sources.col.coverage')} value={coverage[name]} />
            <Row label={tr('sources.col.asof')} value={meta.as_of} />
            <Row label={tr('sources.col.license')} value={meta.license} />
          </Card>
        );
      })}

      <Card>
        <CardTitle title={tr('nav.about')} />
        <Section title={tr('about.what.title')} lines={[tr('about.what.body')]} />
        <Section title={tr('about.method.title')} lines={[tr('about.method.change'), tr('about.method.cagr')]} />
        <Section title={tr('about.ai.title')} lines={[tr('about.ai.body')]} />
        <Section
          title={tr('about.limits.title')}
          lines={[tr('about.limits.physicians'), regionCaveat(lang, bundledRegion.check), tr('about.limits.gaps')]}
        />
      </Card>
      <View style={{ height: 4 }} />
    </Screen>
  );

  function Row({ label, value }: { label: string; value: string }) {
    return (
      <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
        <Text style={[styles.rowLabel, { color: c.muted }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: c.fg }]}>{value}</Text>
      </View>
    );
  }

  function Section({ title, lines }: { title: string; lines: string[] }) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={[styles.sectionTitle, { color: c.fg }]} accessibilityRole="header">
          {title}
        </Text>
        {lines.map((line) => (
          <Text key={line} style={[styles.body, { color: c.muted }]}>
            {line}
          </Text>
        ))}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 22 },
  linkTitle: { fontSize: 17, fontWeight: '700' },
  row: { gap: 2 },
  rowLabel: { fontSize: 12.5, fontWeight: '600' },
  rowValue: { fontSize: 15, lineHeight: 21 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  body: { fontSize: 14.5, lineHeight: 21 },
});
