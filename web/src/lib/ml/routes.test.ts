import { describe, expect, it } from 'vitest';
import { GET as getModel } from '@/app/api/model/route';
import { OPTIONS, POST } from '@/app/api/predict/route';
import { createMlClient, MlApiError } from './client';
import type { ApiErrorBody, ModelInfoResponse, PredictResponse } from './types';

function post(body: string, headers: Record<string, string> = {}) {
  return POST(new Request('http://test/api/predict', { method: 'POST', body, headers }));
}

describe('/api/model', () => {
  it('returns the feature schema without the internal estimator', async () => {
    const res = getModel();
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = (await res.json()) as ModelInfoResponse & { model: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.model.features.length).toBeGreaterThan(0);
    expect(body.model).not.toHaveProperty('estimator');
    expect(body.model).not.toHaveProperty('columns');
  });
});

describe('/api/predict', () => {
  it('predicts one row and reports the model it used', async () => {
    const res = await post(JSON.stringify({ inputs: { bmi: 30, sex: 'group_2' } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as PredictResponse;
    expect(body.predictions).toHaveLength(1);
    expect(body.model.kind).toBe('fixture');
  });

  it('answers 400 with a code for bad JSON and bad inputs', async () => {
    const bad = await post('{not json');
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as ApiErrorBody).error.code).toBe('invalid_json');
    const unknown = await post(JSON.stringify({ inputs: { nope: 1 } }));
    expect(unknown.status).toBe(400);
    const err = (await unknown.json()) as ApiErrorBody;
    expect(err.error.code).toBe('invalid_input');
    expect(err.error.details?.[0]).toEqual({ row: 0, field: 'nope', issue: 'unknown feature' });
  });

  it('answers 413 for a body over 32 KB', async () => {
    const res = await post(JSON.stringify({ inputs: { bmi: 1 }, pad: 'x'.repeat(40_000) }));
    expect(res.status).toBe(413);
  });

  it('answers the CORS preflight', () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('client', () => {
  // Routes the client's fetch calls to the route handlers, as the deployed app would.
  const routed: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/model')) return getModel();
    return POST(new Request(url, init));
  };

  it('gets the model and a prediction', async () => {
    const client = createMlClient({ baseUrl: 'https://app.example/', fetchImpl: routed });
    const model = await client.getModel();
    const res = await client.predict({ bmi: 25 });
    expect(model.name).toBe(res.model.name);
  });

  it('turns an API error into MlApiError with its code and details', async () => {
    const client = createMlClient({ baseUrl: 'https://app.example', fetchImpl: routed });
    const err = await client.predict({ nope: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MlApiError);
    expect((err as MlApiError).code).toBe('invalid_input');
    expect((err as MlApiError).details).toHaveLength(1);
  });

  it('reports network failures and non-JSON answers', async () => {
    const down = createMlClient({ baseUrl: '', fetchImpl: async () => Promise.reject(new TypeError('offline')) });
    expect(((await down.getModel().catch((e: unknown) => e)) as MlApiError).code).toBe('network');
    const html = createMlClient({ baseUrl: '', fetchImpl: async () => new Response('<html>', { status: 502 }) });
    expect(((await html.getModel().catch((e: unknown) => e)) as MlApiError).code).toBe('bad_response');
  });
});
