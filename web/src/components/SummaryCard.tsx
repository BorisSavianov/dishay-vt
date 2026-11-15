'use client';

import { useState } from 'react';
import type { DatasetName, Lang } from '@/lib/types';

export type SummaryLabels = {
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

export function SummaryCard({
  dataset,
  lang,
  title,
  labels,
}: {
  dataset: DatasetName;
  lang: Lang;
  title: string;
  labels: SummaryLabels;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });

  async function run() {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dataset, lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        text: string;
        provider: 'groq' | 'gemini' | 'mock';
        cached: boolean;
      };
      setState({ status: 'done', text: data.text, provider: data.provider, cached: data.cached });
    } catch {
      setState({ status: 'error' });
    }
  }

  return (
    <article className="summary">
      <h3>{title}</h3>
      <button type="button" onClick={run} disabled={state.status === 'loading'}>
        {state.status === 'loading' ? labels.loading : labels.button}
      </button>
      <div aria-live="polite">
        {state.status === 'error' && <p className="error">{labels.error}</p>}
        {state.status === 'done' && (
          <>
            <p>{state.text}</p>
            <p className="badge">
              {labels.provider[state.provider]}
              {state.cached ? `, ${labels.cached}` : ''}
            </p>
          </>
        )}
      </div>
    </article>
  );
}
