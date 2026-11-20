import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { API_BASE, fetchSummary } from './api';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('fetchSummary', () => {
  it('posts the dataset and language to the summary route', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ text: 'ok', provider: 'groq', cached: false }), { status: 200 });
    }) as typeof fetch;

    const out = await fetchSummary('population', 'en');

    assert.equal(out.provider, 'groq');
    assert.equal(calls[0]!.url, `${API_BASE}/api/summary`);
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { dataset: 'population', lang: 'en' });
  });

  it('throws on a non-OK response so the card can show an error', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 500 })) as typeof fetch;
    await assert.rejects(fetchSummary('physicians', 'bg'), /summary 500/);
  });
});
