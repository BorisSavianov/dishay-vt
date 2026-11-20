'use client';

import { useEffect, useState } from 'react';
import type { Lang } from '@/lib/types';

export type ExplainLabels = {
  title: string;
  sub: string;
  button: string;
  loading: string;
  error: string;
  cached: string;
  provider: { groq: string; gemini: string; mock: string };
};

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; text: string; provider: 'groq' | 'gemini' | 'mock'; cached: boolean };

// Asks /api/aq/explain to explain one station's forecast for one group. The answer is checked on the server:
// it may only use the numbers in the forecast, else the forecast facts are shown as they are.
export function ExplainCard({ station, profile, lang, labels }: { station: string; profile: string; lang: Lang; labels: ExplainLabels }) {
  const [state, setState] = useState<State>({ status: 'idle' });

  // A new station or group makes the old answer wrong.
  useEffect(() => setState({ status: 'idle' }), [station, profile, lang]);

  async function run() {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/aq/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ station, profile, lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { text: string; provider: 'groq' | 'gemini' | 'mock'; cached: boolean };
      setState({ status: 'done', text: data.text, provider: data.provider, cached: data.cached });
    } catch {
      setState({ status: 'error' });
    }
  }

  return (
    <section className="card insight explain-card" aria-labelledby="explain-title">
      <h2 className="card-title" id="explain-title">
        {labels.title}
      </h2>
      <p className="card-sub">{labels.sub}</p>
      <button type="button" onClick={run} disabled={state.status === 'loading'} className="btn btn-primary">
        {state.status === 'loading' ? labels.loading : labels.button}
      </button>
      <div aria-live="polite" className="summary-output">
        {state.status === 'error' && <p className="error">{labels.error}</p>}
        {state.status === 'done' && (
          <>
            <p className="summary-text explain-text">{state.text}</p>
            <p className="badge">
              {labels.provider[state.provider]}
              {state.cached ? `, ${labels.cached}` : ''}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
