import { describe, expect, it } from 'vitest';
import { bundled } from './data';
import { buildFacts, numbersOf } from './facts';
import { createMemoryStore } from './store';
import { summarize, type SummaryInput } from './summary';

const base = { dataset: 'population' as const, ip: '203.0.113.7', datasets: bundled };

function input(overrides: Partial<SummaryInput>): SummaryInput {
  return { ...base, lang: 'en', env: {}, store: createMemoryStore(), ...overrides };
}

function providerReply(content: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })) as typeof fetch;
}

describe('facts', () => {
  it('states the population change with its two end values', () => {
    const [fact] = buildFacts(bundled, 'population', 'en');
    expect(fact).toContain('238,456 (2015)');
    expect(fact).toContain('200,413 (2025)');
    expect(fact).toContain('-16.0%');
  });

  it('reads Bulgarian thousands and decimals', () => {
    expect(numbersOf('238 456 и 4,33')).toEqual([238456, 4.33]);
  });
});

describe('summarize', () => {
  it('returns text built from the figures when no key is set', async () => {
    const out = await summarize(input({}));
    expect(out.provider).toBe('mock');
    expect(out.reason).toBe('no_key');
    expect(out.text).toContain('-16.0%');
  });

  it('rejects a provider answer with a figure not in the facts', async () => {
    const out = await summarize(
      input({ env: { GROQ_API_KEY: 'test' }, fetchImpl: providerReply('Population fell to 150,000.') }),
    );
    expect(out.provider).toBe('mock');
    expect(out.reason).toBe('ungrounded');
  });

  it('accepts a grounded answer and serves the second request from cache', async () => {
    const store = createMemoryStore();
    const reply = providerReply('Population fell 16.0% from 238,456 in 2015 to 200,413 in 2025.');
    const first = await summarize(input({ env: { GROQ_API_KEY: 'test' }, fetchImpl: reply, store }));
    expect(first.provider).toBe('groq');
    expect(first.cached).toBe(false);
    const second = await summarize(input({ env: { GROQ_API_KEY: 'test' }, fetchImpl: reply, store }));
    expect(second.cached).toBe(true);
  });

  it('stops live calls for a visitor after the per-minute limit', async () => {
    const store = createMemoryStore();
    const reply = providerReply('Population fell 16.0% from 238,456 in 2015 to 200,413 in 2025.');
    const env = { GROQ_API_KEY: 'test', AI_PER_MINUTE: '1', AI_PER_DAY: '50' };
    await summarize(input({ env, fetchImpl: reply, store }));
    const limited = await summarize(input({ lang: 'bg', env, fetchImpl: reply, store }));
    expect(limited.provider).toBe('mock');
    expect(limited.reason).toBe('rate_limited');
  });
});
