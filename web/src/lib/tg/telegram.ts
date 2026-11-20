// The Telegram Bot API over plain fetch.

export class TgError extends Error {
  constructor(
    public code: number,
    description: string,
  ) {
    super(description);
    this.name = 'TgError';
  }
}

export type Send = (method: string, body: Record<string, unknown>) => Promise<void>;

export function botSend(token: string, fetchImpl: typeof fetch = fetch): Send {
  return async (method, body) => {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error_code?: number; description?: string };
    if (!data.ok) throw new TgError(data.error_code ?? res.status, data.description ?? `HTTP ${res.status}`);
  };
}
