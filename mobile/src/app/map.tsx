import { Card, CardTitle, Note } from '../components/Card';
import { LiveMap } from '../components/LiveMap';
import { Screen } from '../components/Screen';
import { SourceLine } from '../components/SourceLine';
import { bundled, bundledRegion } from '../lib/data';
import { orderTypes } from '../lib/facility-types';
import { useLang } from '../lib/lang';
import { typeLabel } from '../shared/facts';
import { t, type MessageKey } from '../shared/i18n';
import { regionCaveat } from '../shared/pin';
import { updatedAt } from '../shared/metrics';

export default function MapScreen() {
  const { lang } = useLang();
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const { facilities } = bundled;
  const types = orderTypes(Object.keys(facilities.counts)).map((type) => ({
    type,
    label: typeLabel(lang, type),
    count: facilities.counts[type] ?? 0,
  }));

  return (
    <Screen title={tr('nav.geo')} lead={tr('geo.lead')} updated={updatedAt(bundled)}>
      <Card>
        <CardTitle title={tr('map.title')} />
        <LiveMap
          points={facilities.points}
          types={types}
          region={bundledRegion.geometry}
          lang={lang}
          labels={{
            alt: tr('map.alt'),
            typeHeading: tr('map.type'),
            shownLabel: tr('map.count'),
            fallback: tr('map.fallback'),
          }}
        />
        <Note>{regionCaveat(lang, bundledRegion.check)}</Note>
        <SourceLine meta={facilities.meta} asOf={tr('sources.asof')} licence={tr('sources.license')} />
      </Card>
    </Screen>
  );
}
