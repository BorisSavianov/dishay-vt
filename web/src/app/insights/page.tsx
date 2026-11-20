import type { Metadata } from 'next';
import { ExplainCard } from '@/components/aq/ExplainCard';
import { StationPicker } from '@/components/aq/StationPicker';
import { AppShell } from '@/components/shell/AppShell';
import { buildAqFacts } from '@/lib/aq/explain';
import { PROFILES, type Profile } from '@/lib/aq/levels';
import { featuredStation, loadForecast } from '@/lib/aq/load';
import { air, profileName, type AirKey } from '@/lib/aq/strings';
import { t } from '@/lib/i18n';
import { langOf } from '@/lib/page';

export const dynamic = 'force-dynamic';

type Params = Promise<{ lang?: string | string[]; station?: string | string[]; profile?: string | string[] }>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: `${t(lang, 'nav.ai')} · ${t(lang, 'brand.name')}`, description: air(lang, 'ex.insights.lead') };
}

// The forecast explained for one group. Next to the AI answer are the exact facts it was allowed to use.
export default async function Insights({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const lang = langOf(params);
  const tr = (key: AirKey, vars?: Record<string, string | number>) => air(lang, key, vars);
  const { source, forecast } = await loadForecast();
  const station = forecast.stations.find((s) => s.id === params.station) ?? featuredStation(forecast);
  const profile: Profile = PROFILES.find((p) => p === params.profile) ?? 'asthma';
  const facts = buildAqFacts(station, profile, lang, forecast.generated_at, new Date());

  return (
    <AppShell lang={lang} active="ai" title={t(lang, 'nav.ai')} lead={tr('ex.insights.lead')} updated={forecast.generated_at}>
      {source === 'demo' && (
        <p className="notice" role="status">
          {tr('air.demo')}
        </p>
      )}
      <section className="card explain-pick">
        <StationPicker stations={forecast.stations} station={station.id} profile={profile} lang={lang} action="/insights" />
      </section>
      <div className="row-split">
        <ExplainCard
          station={station.id}
          profile={profile}
          lang={lang}
          labels={{
            title: tr('ex.title'),
            sub: tr('ex.sub'),
            button: tr('ex.button', { profile: profileName(lang, profile) }),
            loading: tr('ex.loading'),
            error: tr('ex.error'),
            cached: t(lang, 'summary.cached'),
            provider: {
              groq: t(lang, 'summary.provider.groq'),
              gemini: t(lang, 'summary.provider.gemini'),
              mock: t(lang, 'summary.provider.mock'),
            },
          }}
        />
        <section className="card" aria-labelledby="facts-title">
          <h2 className="card-title" id="facts-title">
            {tr('ex.facts.title')}
          </h2>
          <p className="card-sub">{tr('ex.facts.sub')}</p>
          <ul className="facts-list">
            {facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
