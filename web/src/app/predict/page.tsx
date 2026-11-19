import { PredictForm } from '@/components/PredictForm';
import { Sources } from '@/components/Sources';
import { fmtNum } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { loadModel, modelInfo } from '@/lib/ml/model';
import type { Lang } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PredictPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const params = await searchParams;
  const lang: Lang = params.lang === 'en' ? 'en' : 'bg';
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const artifact = loadModel();
  const model = artifact ? modelInfo(artifact) : null;
  const metricNames = model
    ? [...new Set([...Object.keys(model.metrics.model), ...Object.keys(model.metrics.baseline)])]
    : [];
  const show = (v: number | null | undefined) => (typeof v === 'number' ? fmtNum(lang, v, 3) : '–');

  return (
    <main lang={lang}>
      <header>
        <h1>{tr('predict.title')}</h1>
        <p>{tr('predict.lead')}</p>
        <nav aria-label={tr('lang.label')}>
          <a href={`/?lang=${lang}`}>{tr('nav.home')}</a> ·{' '}
          <a href="?lang=bg" hrefLang="bg" aria-current={lang === 'bg' ? 'page' : undefined}>
            {tr('lang.bg')}
          </a>{' '}
          ·{' '}
          <a href="?lang=en" hrefLang="en" aria-current={lang === 'en' ? 'page' : undefined}>
            {tr('lang.en')}
          </a>
        </nav>
      </header>

      {!model && <p className="notice">model.json is missing or invalid. Run python -m ml.train.</p>}
      {model?.kind === 'fixture' && <p className="notice">{tr('predict.fixture')}</p>}

      {model && (
        <>
          <PredictForm lang={lang} features={model.features} unit={model.target.unit} />

          <section>
            <h2>{tr('predict.model.title')}</h2>
            <p>
              {model.target.name}: {tr('predict.model.algorithm', { algorithm: model.algorithm, version: model.version })}
            </p>
            <table className="metrics">
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
            <p className="caveat">{tr('predict.metrics.note', { test: model.metrics.rows.test })}</p>

            <h3>{tr('predict.importance')}</h3>
            <ul className="bars">
              {model.importances.slice(0, 5).map((imp) => (
                <li key={imp.feature}>
                  <span>{imp.feature}</span>
                  <span className="bar" style={{ width: `${Math.round(imp.value * 100)}%` }} />
                  <span>{fmtNum(lang, imp.value * 100, 0)}%</span>
                </li>
              ))}
            </ul>
          </section>

          <Sources
            metas={[model.meta]}
            title={tr('sources.title')}
            asOf={tr('sources.asof')}
            licence={tr('sources.license')}
          />
        </>
      )}
    </main>
  );
}
