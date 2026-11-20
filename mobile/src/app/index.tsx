import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, CardTitle, Kpi, Note } from '../components/Card';
import { Donut } from '../components/Donut';
import { Icon } from '../components/Icon';
import { LiveMap } from '../components/LiveMap';
import { Screen } from '../components/Screen';
import { SourceLine } from '../components/SourceLine';
import { TrendChart } from '../components/TrendChart';
import { useColors } from '../lib/color-mode';
import { bundled, bundledRegion } from '../lib/data';
import { orderTypes } from '../lib/facility-types';
import { useLang } from '../lib/lang';
import { ui } from '../lib/ui-strings';
import { typeLabel } from '../shared/facts';
import { changePct, fmtInt, fmtNum, fmtPct } from '../shared/format';
import { t, type MessageKey } from '../shared/i18n';
import { insightText } from '../shared/insight';
import { regionCaveat } from '../shared/pin';
import { cagr, span, splitFacilities, updatedAt } from '../shared/metrics';

export default function Dashboard() {
  const { lang } = useLang();
  const c = useColors();
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);

  const pop = bundled.population.series;
  const popSpan = span(pop);
  const phys = bundled.physicians.series[bundled.physicians.series.length - 1];
  const split = splitFacilities(bundled.facilities.counts);
  const insight = insightText(lang, pop);
  const pct = popSpan ? changePct(popSpan.first.value, popSpan.last.value) : null;
  const mapTypes = orderTypes(Object.keys(bundled.facilities.counts)).map((type) => ({
    type,
    label: typeLabel(lang, type),
    count: bundled.facilities.counts[type] ?? 0,
  }));
  const rate = popSpan ? cagr(popSpan.first.value, popSpan.last.value, popSpan.years) : null;

  return (
    <Screen title={tr('dash.title')} lead={tr('site.lead')} updated={updatedAt(bundled)}>
      <View style={styles.kpis}>
        {popSpan && pct !== null && (
          <Kpi
            primary
            icon="users"
            label={tr('kpi.population.label', { year: popSpan.last.year })}
            value={fmtInt(lang, popSpan.last.value)}
            delta={{ text: fmtPct(lang, pct), negative: pct < 0 }}
            sub={tr('kpi.population.vs', { year: popSpan.first.year })}
          />
        )}
        {popSpan && rate !== null && (
          <Kpi
            icon={rate < 0 ? 'trendDown' : 'trendUp'}
            label={tr('kpi.change.label')}
            value={fmtPct(lang, rate, 2)}
            sub={tr('kpi.change.sub', { first: popSpan.first.year, last: popSpan.last.year })}
          />
        )}
        {phys && (
          <Kpi
            icon="activity"
            label={tr('kpi.physicians.label')}
            value={fmtNum(lang, phys.value, 2)}
            sub={tr('kpi.physicians.sub', { year: phys.year })}
          />
        )}
        <Kpi
          icon="building"
          label={tr('kpi.facilities.label')}
          value={fmtInt(lang, split.healthTotal)}
          sub={tr('kpi.facilities.sub', { count: fmtInt(lang, split.busStops) })}
        />
      </View>

      <Card>
        <CardTitle title={tr('trend.title')} sub={tr('trend.sub')} />
        <TrendChart
          series={pop}
          lang={lang}
          labels={{
            type: tr('trend.type'),
            line: tr('trend.line'),
            area: tr('trend.area'),
            bar: tr('trend.bar'),
            alt: popSpan
              ? tr('trend.alt', { title: tr('trend.title'), first: popSpan.first.year, last: popSpan.last.year })
              : tr('trend.title'),
            hint: ui(lang, 'chart.hint'),
            readout: tr('trend.readout', { label: tr('trend.title') }),
          }}
        />
        <SourceLine meta={bundled.population.meta} asOf={tr('sources.asof')} licence={tr('sources.license')} />
      </Card>

      <Card soft>
        <View style={styles.insightTitle}>
          <Icon name="sparkle" color={c.accent} />
          <CardTitle title={tr('insight.title')} />
        </View>
        {insight ? <Text style={[styles.insight, { color: c.fg }]}>{insight}</Text> : null}
        <Pressable
          onPress={() => router.navigate('/insights')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, { backgroundColor: c.card, borderColor: c.line }, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.ctaText, { color: c.fg }]}>{tr('insight.cta')}</Text>
          <Icon name="arrow" color={c.fg} size={20} />
        </Pressable>
      </Card>

      <Card>
        <CardTitle title={tr('donut.title')} />
        <Donut
          lang={lang}
          total={split.healthTotal}
          totalLabel={tr('donut.total')}
          alt={tr('donut.title')}
          parts={split.health.map((h) => ({ ...h, label: typeLabel(lang, h.type) }))}
        />
        <Note>{tr('donut.note', { count: fmtInt(lang, split.busStops) })}</Note>
        <SourceLine meta={bundled.facilities.meta} asOf={tr('sources.asof')} licence={tr('sources.license')} />
      </Card>

      <Card>
        <CardTitle title={tr('map.title')} />
        <LiveMap
          preview
          onOpen={() => router.navigate('/map')}
          points={bundled.facilities.points}
          types={mapTypes}
          region={bundledRegion.geometry}
          lang={lang}
          labels={{
            alt: tr('map.alt'),
            typeHeading: tr('map.type'),
            shownLabel: tr('map.count'),
            fallback: tr('map.fallback'),
          }}
        />
        <Pressable
          onPress={() => router.navigate('/map')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, { backgroundColor: c.card, borderColor: c.line }, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.ctaText, { color: c.fg }]}>{tr('dash.map.open')}</Text>
          <Icon name="arrow" color={c.fg} size={20} />
        </Pressable>
        <Note>{regionCaveat(lang, bundledRegion.check)}</Note>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  insightTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  insight: { fontSize: 16.5, lineHeight: 25 },
  cta: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  ctaText: { fontSize: 15, fontWeight: '700' },
});
