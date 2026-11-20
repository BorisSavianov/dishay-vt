import { router } from 'expo-router';
import { useAir } from '../aq/store';
import { air } from '../aq/strings';
import { AirMap } from '../components/AirMap';
import { Card, CardTitle, Columns, Note } from '../components/Card';
import { LiveMap } from '../components/LiveMap';
import { Screen } from '../components/Screen';
import { SourceLine } from '../components/SourceLine';
import { bundled, bundledRegion } from '../lib/data';
import { orderTypes } from '../lib/facility-types';
import { useLang } from '../lib/lang';
import { useLayout } from '../lib/layout';
import { typeLabel } from '../shared/facts';
import { t, type MessageKey } from '../shared/i18n';

// The air map first (stations coloured by forecast level), then the health layer: pharmacies and hospitals.
// Bus stops are not part of this app's story, so the layer leaves them out.
export default function MapScreen() {
  const { lang } = useLang();
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const { columns } = useLayout();
  const { forecast, home, setPrefs } = useAir();
  const { facilities } = bundled;
  const healthPoints = facilities.points.filter((p) => p.type !== 'bus_stop');
  const types = orderTypes(Object.keys(facilities.counts))
    .filter((type) => type !== 'bus_stop')
    .map((type) => ({ type, label: typeLabel(lang, type), count: facilities.counts[type] ?? 0 }));

  const airCard = forecast ? (
    <Card>
      <CardTitle title={air(lang, 'air.map.title')} sub={air(lang, 'air.map.lead')} />
      <AirMap
        stations={forecast.stations}
        homeId={home?.id ?? null}
        lang={lang}
        onPick={(s) => {
          setPrefs({ stationId: s.id });
          router.navigate('/');
        }}
      />
      <Note>{air(lang, 'air.source')}</Note>
    </Card>
  ) : null;

  const healthCard = (
    <Card>
      <CardTitle title={air(lang, 'map.layer.title')} sub={air(lang, 'map.layer.lead')} />
      <LiveMap
        points={healthPoints}
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
      <SourceLine meta={facilities.meta} asOf={tr('sources.asof')} licence={tr('sources.license')} />
    </Card>
  );

  return (
    <Screen title={air(lang, 'tab.map')}>
      <Columns columns={columns} left={airCard} right={healthCard} />
    </Screen>
  );
}
