import type { DatasetName, Lang } from '../shared/types';

export type SummaryResult = {
  text: string;
  provider: 'groq' | 'gemini' | 'mock';
  cached: boolean;
};

// Points at the hosted web app's API. Override for a local server with EXPO_PUBLIC_API_URL
// (the name in mobile-kit/README.md); EXPO_PUBLIC_API_BASE still works.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_API_BASE ?? 'https://fmi-open-data.vercel.app';

const TIMEOUT_MS = 12_000;

export async function fetchSummary(dataset: DatasetName, lang: Lang): Promise<SummaryResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/api/summary`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataset, lang }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`summary ${res.status}`);
    return (await res.json()) as SummaryResult;
  } finally {
    clearTimeout(timer);
  }
}
