import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const KIT_FILES = ['types.ts', 'client.ts', 'usePrediction.ts'];
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('mobile-kit', () => {
  for (const file of KIT_FILES) {
    it(`mobile-kit/ml/${file} matches web/src/lib/ml/${file} (run pnpm ml:kit)`, () => {
      const web = read(join(__dirname, file));
      const kit = read(join(__dirname, '..', '..', '..', '..', 'mobile-kit', 'ml', file));
      expect(kit).toBe(web);
    });
  }
});
