import { neon } from '@neondatabase/serverless';

type Sql = ReturnType<typeof neon>;

let cached: Sql | null | undefined;

// Returns null when DATABASE_URL is not set, so the app uses the bundled data.
export function getSql(): Sql | null {
  if (cached === undefined) {
    const url = process.env.DATABASE_URL;
    cached = url ? neon(url) : null;
  }
  return cached;
}
