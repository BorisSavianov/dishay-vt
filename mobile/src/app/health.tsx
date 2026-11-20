import { Card, CardTitle, Note } from '../components/Card';
import { Donut } from '../components/Donut';
import { Screen } from '../components/Screen';
import { SourceLine } from '../components/SourceLine';
import { TrendChart } from '../components/TrendChart';
import { bundled } from '../lib/data';
import { useLang } from '../lib/lang';
import { ui } from '../lib/ui-strings';
import { typeLabel } from '../shared/facts';
import { fmtInt } from '../shared/format';
import { t, type MessageKey } from '../shared/i18n';
import { span, splitFacilities, updatedAt } from '../shared/metrics';

export default function Health() {
  const { lang } = useLang();
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const series = bundled.physicians.series;
  const physSpan = span(series);
  const split = splitFacilities(bundled.facilities.counts);

  return (
    <Screen title={tr('nav.health')} lead={tr('health.lead')} updated={updatedAt(bundled)}>
      <Card>
        <CardTitle title={tr('health.trend.title')} sub={tr('health.trend.sub')} />
        <TrendChart
          series={series}
          lang={lang}
          digits={2}
          labels={{
            type: tr('trend.type'),
            line: tr('trend.line'),
            area: tr('trend.area'),
            bar: tr('trend.bar'),
            alt: physSpan
              ? tr('trend.alt', { title: tr('health.trend.title'), first: physSpan.first.year, last: physSpan.last.year })
              : tr('health.trend.title'),
            hint: ui(lang, 'chart.hint'),
            readout: tr('trend.readout', { label: tr('health.trend.title') }),
          }}
        />
        <Note>{tr('health.note')}</Note>
        <SourceLine meta={bundled.physicians.meta} asOf={tr('sources.asof')} licence={tr('sources.license')} />
      </Card>

      <Card>
        <CardTitle title={tr('health.facilities.title')} />
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
    </Screen>
  );
}
