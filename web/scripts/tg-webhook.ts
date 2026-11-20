// One-time bot setup: points Telegram at the production webhook and sets the command menu.
// Run: pnpm tg:webhook (reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and TG_WEBHOOK_URL from .env.local).
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const url = process.env.TG_WEBHOOK_URL;
if (!token || !secret || !url) {
  console.error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and TG_WEBHOOK_URL in web/.env.local');
  process.exit(1);
}

async function call(method: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

async function main(): Promise<void> {
  await call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  await call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Профил и прогноза' },
      { command: 'stop', description: 'Спри известията' },
    ],
  });
  console.log(JSON.stringify(await call('getWebhookInfo'), null, 2));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
