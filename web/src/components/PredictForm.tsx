'use client';

import { useState, type FormEvent } from 'react';
import { fmtNum } from '@/lib/format';
import { t } from '@/lib/i18n';
import { createMlClient } from '@/lib/ml/client';
import { OTHER } from '@/lib/ml/preprocess';
import { isClassPrediction, type DecisionStep, type FeatureSpec, type InputRow } from '@/lib/ml/types';
import { usePrediction } from '@/lib/ml/usePrediction';
import type { Lang } from '@/lib/types';

// Same-origin calls; the mobile app uses the same client with the deployed URL as baseUrl.
const client = createMlClient({ baseUrl: '' });

function fmt(lang: Lang, n: number): string {
  return fmtNum(lang, n, Math.abs(n) >= 100 ? 0 : 2);
}

function categoryLabel(lang: Lang, value: string): string {
  return value === OTHER ? t(lang, 'predict.form.other') : value;
}

function stepText(lang: Lang, step: DecisionStep): string {
  if ('threshold' in step) {
    const op = step.op === '<=' ? '≤' : '>';
    return `${step.feature} ${op} ${fmt(lang, step.threshold)} (${t(lang, 'predict.path.yours', { value: fmt(lang, step.input) })})`;
  }
  const op = step.op === '=' ? '=' : '≠';
  return `${step.feature} ${op} ${categoryLabel(lang, step.value)} (${t(lang, 'predict.path.yours', { value: categoryLabel(lang, step.input) })})`;
}

export function PredictForm({ lang, features, unit }: { lang: Lang; features: FeatureSpec[]; unit: string | null }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const { state, predict } = usePrediction(client);

  function submit(e: FormEvent) {
    e.preventDefault();
    const row: InputRow = {};
    for (const [name, value] of Object.entries(values)) if (value.trim() !== '') row[name] = value;
    void predict(row);
  }

  const result = state.status === 'done' ? state.data : null;
  const prediction = result?.predictions[0];

  return (
    <div className="predict-grid">
      <form onSubmit={submit} className="card">
        <div className="card-head">
          <h2 className="card-title">{t(lang, 'predict.form.title')}</h2>
        </div>
        <div className="form-grid">
          {features.map((f) => (
            <label key={f.name} className="field">
              <span>{f.name}</span>
              {f.type === 'number' ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={values[f.name] ?? ''}
                  placeholder={t(lang, 'predict.form.typical', { value: fmt(lang, f.impute) })}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                />
              ) : (
                <select value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                  <option value="">{t(lang, 'predict.form.typical', { value: categoryLabel(lang, f.impute) })}</option>
                  {f.categories.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(lang, c)}
                    </option>
                  ))}
                </select>
              )}
              {f.type === 'number' && f.min !== null && f.max !== null && (
                <small>{t(lang, 'predict.form.range', { min: fmt(lang, f.min), max: fmt(lang, f.max) })}</small>
              )}
            </label>
          ))}
        </div>
        <button type="submit" className="btn btn-primary" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? t(lang, 'predict.loading') : t(lang, 'predict.button')}
        </button>
      </form>

      <section className="card" aria-live="polite">
        <div className="card-head">
          <h2 className="card-title">{t(lang, 'predict.result')}</h2>
        </div>
        {state.status === 'error' && (
          <p className="error" role="alert">
            {t(lang, 'predict.error', { message: state.error.message })}
            {state.error.details.length > 0 &&
              ` (${state.error.details.map((d) => `${d.field ?? ''} ${d.issue}`).join('; ')})`}
          </p>
        )}
        {state.status !== 'error' && !prediction && <p className="note">{t(lang, 'predict.empty')}</p>}
        {prediction && (
          <>
            {isClassPrediction(prediction) ? (
              <>
                <p className="kpi-value">{prediction.label}</p>
                <ul className="bars">
                  {Object.entries(prediction.probabilities)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([label, p]) => (
                      <li key={label}>
                        <span>{label}</span>
                        <span className="bar-track">
                          <span className="bar" style={{ width: `${Math.round(p * 100)}%` }} />
                        </span>
                        <span>{fmtNum(lang, p * 100, 1)}%</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <>
                <p className="kpi-value">{fmt(lang, prediction.value)}</p>
                {unit && <p className="kpi-sub">{unit}</p>}
              </>
            )}
            {result?.explanations?.[0] && (
              <>
                <h3 className="result-sub">{t(lang, 'predict.path')}</h3>
                <ol className="path">
                  {result.explanations[0].map((step, i) => (
                    <li key={i}>{stepText(lang, step)}</li>
                  ))}
                </ol>
              </>
            )}
            {result && result.warnings.length > 0 && (
              <details className="note">
                <summary>
                  {t(lang, 'predict.warnings')} ({result.warnings.length})
                </summary>
                <ul className="path">
                  {result.warnings.map((w, i) => (
                    <li key={i}>
                      {w.field}: {w.issue}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="badge">
              {result?.model.name} · {result?.model.version}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
