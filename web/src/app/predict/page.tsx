import type { Metadata } from 'next';
import { PredictForm } from '@/components/PredictForm';
import { AppShell } from '@/components/shell/AppShell';
import { fmtNum } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { loadModel, modelInfo } from '@/lib/ml/model';
import { langOf, type SearchParams } from '@/lib/page';
import { sourceLine } from '@/lib/sources';

// The model can change between deploys and the page reads it per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: `${t(lang, 'nav.predict')} · ${t(lang, 'brand.name')}`, description: t(lang, 'predict.lead') };
}

export default async function PredictPage({ searchParams }: { searchParams: SearchParams }) {
  const lang = langOf(await searchParams);
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const artifact = loadModel();
  const model = artifact ? modelInfo(artifact) : null;
  const metricNames = model
    ? [...new Set([...Object.keys(model.metrics.model), ...Object.keys(model.metrics.baseline)])]
    : [];
  const show = (v: number | null | undefined) => (typeof v === 'number' ? fmtNum(lang, v, 3) : '–');

  return (
    <AppShell lang={lang} active="predict" title={tr('predict.title')} lead={tr('predict.lead')}>
      {!model && (
        <p className="notice" role="status">
          {tr('predict.missing')}
        </p>
      )}
      {model?.kind === 'fixture' && (
        <p className="notice" role="status">
          {tr('predict.fixture')}
        </p>
      )}

      {model && (
        <>
          <PredictForm lang={lang} features={model.features} unit={model.target.unit} />

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">{tr('predict.model.title')}</h2>
                <p className="card-sub">
                  {model.target.name}:{' '}
                  {tr('predict.model.algorithm', { algorithm: model.algorithm, version: model.version })}
                </p>
              </div>
            </div>
            <div className="row-split">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{tr('predict.metrics.metric')}</th>
                      <th scope="col">{tr('predict.metrics.model')}</th>
                      <th scope="col">{tr('predict.metrics.baseline')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricNames.map((m) => (
                      <tr key={m}>
                        <th scope="row">{m}</th>
                        <td>{show(model.metrics.model[m])}</td>
                        <td>{show(model.metrics.baseline[m])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="note">{tr('predict.metrics.note', { test: model.metrics.rows.test })}</p>
              </div>
              <div>
                <h3 className="result-sub">{tr('predict.importance')}</h3>
                <ul className="bars">
                  {model.importances.slice(0, 5).map((imp) => (
                    <li key={imp.feature}>
                      <span>{imp.feature}</span>
                      <span className="bar-track">
                        <span className="bar" style={{ width: `${Math.round(imp.value * 100)}%` }} />
                      </span>
                      <span>{fmtNum(lang, imp.value * 100, 0)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <p className="page-foot source-line">{sourceLine(lang, model.meta)}</p>
        </>
      )}
    </AppShell>
  );
}
