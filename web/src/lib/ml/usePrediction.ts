// React hooks for the ML API. Work in Next.js client components and in React Native.
// mobile-kit/ml/usePrediction.ts is a byte-for-byte copy (run `pnpm ml:kit`).
import { useCallback, useEffect, useRef, useState } from 'react';
import { MlApiError, type MlClient } from './client';
import type { InputRow, ModelInfo, PredictResponse } from './types';

export type Loadable<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: MlApiError }
  | { status: 'done'; data: T };

function asApiError(e: unknown): MlApiError {
  return e instanceof MlApiError ? e : new MlApiError('network', String(e));
}

// Loads /api/model once: the feature list a form is built from, plus metrics for display.
export function useModelInfo(client: MlClient): Loadable<ModelInfo> & { reload: () => void } {
  const [state, setState] = useState<Loadable<ModelInfo>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    client.getModel().then(
      (data) => live && setState({ status: 'done', data }),
      (e: unknown) => live && setState({ status: 'error', error: asApiError(e) }),
    );
    return () => {
      live = false;
    };
  }, [client, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}

// One prediction at a time; a newer request replaces an older one still in flight.
export function usePrediction(client: MlClient) {
  const [state, setState] = useState<Loadable<PredictResponse>>({ status: 'idle' });
  const latest = useRef(0);
  const predict = useCallback(
    async (row: InputRow) => {
      const id = ++latest.current;
      setState({ status: 'loading' });
      try {
        const data = await client.predict(row);
        if (id === latest.current) setState({ status: 'done', data });
      } catch (e) {
        if (id === latest.current) setState({ status: 'error', error: asApiError(e) });
      }
    },
    [client],
  );
  const reset = useCallback(() => {
    latest.current++;
    setState({ status: 'idle' });
  }, []);
  return { state, predict, reset };
}
