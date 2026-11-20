import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Add it to web/.env.local first.');
  process.exit(1);
}
const sql = neon(url);

const schema = readFileSync(fileURLToPath(new URL('../db/schema.sql', import.meta.url)), 'utf8');
const statements = schema
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);
for (const statement of statements) {
  await sql.query(statement);
}
console.log(`schema: ${statements.length} statements applied`);

const files: Array<[string, string]> = [
  ['population', 'population_veliko_tarnovo.json'],
  ['physicians', 'health_physicians_bg.json'],
  ['facilities', 'facilities_veliko_tarnovo.json'],
];
for (const [name, file] of files) {
  const text = readFileSync(fileURLToPath(new URL(`../src/data/${file}`, import.meta.url)), 'utf8');
  const payload = JSON.parse(text) as { meta: { as_of: string } };
  await sql.query(
    `insert into datasets (name, payload, as_of) values ($1, $2, $3)
     on conflict (name) do update set payload = excluded.payload, as_of = excluded.as_of, updated_at = now()`,
    [name, JSON.stringify(payload), payload.meta.as_of],
  );
  console.log(`seeded ${name}`);
}

// The air-quality forecast, only when Teodor's committed file exists. The demo forecast is never seeded,
// so the database never holds invented numbers.
const aqPath = fileURLToPath(new URL('../src/data/aq_forecast.json', import.meta.url));
if (existsSync(aqPath)) {
  const aq = JSON.parse(readFileSync(aqPath, 'utf8')) as {
    generated_at: string;
    model: unknown;
    stations: { id: string }[];
  };
  await sql.query(
    `insert into aq_model (id, generated_at, payload) values (1, $1, $2)
     on conflict (id) do update set generated_at = excluded.generated_at, payload = excluded.payload`,
    [aq.generated_at, JSON.stringify(aq.model)],
  );
  for (const station of aq.stations) {
    await sql.query(
      `insert into aq_forecast (station_id, generated_at, payload) values ($1, $2, $3)
       on conflict (station_id) do update set generated_at = excluded.generated_at, payload = excluded.payload`,
      [station.id, aq.generated_at, JSON.stringify(station)],
    );
  }
  console.log(`seeded aq_forecast: ${aq.stations.length} stations`);
} else {
  console.log('no src/data/aq_forecast.json yet: aq tables left as they are');
}
