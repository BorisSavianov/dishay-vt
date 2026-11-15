import { createHash } from 'node:crypto';
import { buildFacts, isGrounded } from './facts';
import { getStore, type Store } from './store';
import type { Datasets, DatasetName, Lang } from './types';

const MINUTE = 60_000;
const DAY = 24 * 60 * 60_000;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SYSTEM =
  'You summarise public statistics for a jury. Write at most two short sentences in the language requested. ' +
  'Use only the figures given in the facts. Do not add figures, causes or forecasts.';

export type Provider = 'groq' | 'gemini' | 'mock';

export type SummaryOutput = {
  text: string;
  provider: Provider;
  cached: boolean;
  reason?: 'no_key' | 'rate_limited' | 'provider_failed' | 'ungrounded';
};

export type SummaryInput = {
  dataset: DatasetName;
  lang: Lang;
  ip: string;
  datasets: Datasets;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  store?: Store;
};

export function buildPrompt(facts: string[], lang: Lang): string {
  const language = lang === 'bg' ? 'Bulgarian' : 'English';
  return `Language: ${language}.\nFacts:\n${facts.map((f) => `- ${f}`).join('\n')}`;
}

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : fallback;
}

async function callGroq(prompt: string, apiKey: string, model: string, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(GROQ_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1024,
      temperature: 0.2,
      // gpt-oss models reason before answering; keep it short so the answer fits the token budget.
      ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

async function callGemini(prompt: string, apiKey: string, model: string, fetchImpl: typeof fetch): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
}

// Order: cache, then Groq, then Gemini, then text built from the facts. Never throws.
export async function summarize(input: SummaryInput): Promise<SummaryOutput> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const store = input.store ?? getStore();
  const facts = buildFacts(input.datasets, input.dataset, input.lang);
  const fallback = (reason: NonNullable<SummaryOutput['reason']>): SummaryOutput => ({
    text: facts.join(' '),
    provider: 'mock',
    cached: false,
    reason,
  });

  const groqKey = env.GROQ_API_KEY;
  const geminiKey = env.GEMINI_API_KEY;
  if (env.MOCK_LLM === '1' || (!groqKey && !geminiKey)) return fallback('no_key');

  const meta = input.datasets[input.dataset].meta;
  const cacheKey = createHash('sha256')
    .update([input.dataset, input.lang, meta.as_of, meta.generated_at].join('|'))
    .digest('hex');
  const cached = await store.getCache(cacheKey);
  if (cached) return { text: cached.text, provider: cached.provider as Provider, cached: true };

  const visitor = createHash('sha256').update(input.ip).digest('hex').slice(0, 32);
  const minuteOk = await store.allow(`ip:${visitor}:min`, MINUTE, positive(env.AI_PER_MINUTE, 5));
  const dayOk = minuteOk && (await store.allow(`ip:${visitor}:day`, DAY, positive(env.AI_PER_DAY, 50)));
  if (!minuteOk || !dayOk) return fallback('rate_limited');

  const prompt = buildPrompt(facts, input.lang);
  const attempts: Array<{ provider: 'groq' | 'gemini'; run: () => Promise<string> }> = [];
  if (groqKey) {
    attempts.push({
      provider: 'groq',
      run: () => callGroq(prompt, groqKey, env.GROQ_MODEL ?? 'openai/gpt-oss-120b', fetchImpl),
    });
  }
  if (geminiKey) {
    attempts.push({
      provider: 'gemini',
      run: () => callGemini(prompt, geminiKey, env.GEMINI_MODEL ?? 'gemini-3.5-flash', fetchImpl),
    });
  }

  let reason: 'provider_failed' | 'ungrounded' = 'provider_failed';
  for (const attempt of attempts) {
    try {
      const text = await attempt.run();
      if (!isGrounded(text, facts)) {
        reason = 'ungrounded';
        continue;
      }
      await store.putCache(cacheKey, { text, provider: attempt.provider });
      return { text, provider: attempt.provider, cached: false };
    } catch {
      reason = 'provider_failed';
    }
  }
  return fallback(reason);
}
