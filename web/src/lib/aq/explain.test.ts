import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/aq/explain/route';
import { isGrounded } from '../facts';
import { createMemoryStore } from '../store';
import { groundedText } from '../summary';
import { buildAqFacts, cleanestWindow, EXPLAIN_SYSTEM } from './explain';
import { demoForecast } from './mock';

const NOW = new Date('2026-11-20T09:15:00Z');
const forecast = demoForecast(NOW);
const station = forecast.stations.find((s) => s.featured)!;

function post(body: unknown) {
  return POST(new Request('http://test/api/aq/explain', { method: 'POST', body: JSON.stringify(body) }));
}

describe('buildAqFacts', () => {
  it('names the station, the days, the group threshold and advice', () => {
    const facts = buildAqFacts(station, 'asthma', 'en', forecast.generated_at, NOW);
    const text = facts.join(' ');
    expect(text).toContain(station.name);
    expect(text).toContain('"Asthma / breathing" we warn from level 3');
    expect(text).toMatch(/Advice: /);
  });

  it('accepts a sentence that reuses the facts and rejects an invented number', () => {
    const facts = buildAqFacts(station, 'child', 'bg', forecast.generated_at, NOW);
    expect(isGrounded(facts.slice(0, 2).join(' '), facts)).toBe(true);
    expect(isGrounded('Утре PM10 ще е 987 µg/m³.', facts)).toBe(false);
  });
});

describe('cleanestWindow', () => {
  it('finds two consecutive daytime hours in the next day', () => {
    const w = cleanestWindow(station.hourly!, NOW);
    expect(w).not.toBeNull();
    expect(new Date(w!.end).getTime() - new Date(w!.start).getTime()).toBe(2 * 3600_000);
  });
});

describe('forecast explanation', () => {
  it('uses the explain instructions and falls back to the facts on an ungrounded answer', async () => {
    let system = '';
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      system = (JSON.parse(String(init.body)) as { messages: { content: string }[] }).messages[0]!.content;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'PM10 will be 987.' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const facts = buildAqFacts(station, 'runner', 'en', forecast.generated_at, NOW);
    const out = await groundedText({
      facts,
      lang: 'en',
      cacheParts: ['t'],
      ip: '203.0.113.9',
      system: EXPLAIN_SYSTEM,
      env: { GROQ_API_KEY: 'k' },
      fetchImpl,
      store: createMemoryStore(),
    });
    expect(system).toBe(EXPLAIN_SYSTEM);
    expect(out.provider).toBe('mock');
    expect(out.reason).toBe('ungrounded');
    expect(out.text).toBe(facts.join(' '));
  });

  it('answers 400 for a bad profile and text for a good one', async () => {
    expect((await post({ profile: 'cat', lang: 'en' })).status).toBe(400);
    const res = await post({ profile: 'asthma', lang: 'bg' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string; provider: string };
    expect(body.text.length).toBeGreaterThan(20);
  });
});
