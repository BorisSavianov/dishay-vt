// Copies the shared ML client files into mobile-kit/ml/ so the mobile app uses the same contract.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT_FILES = ['types.ts', 'client.ts', 'usePrediction.ts'];
const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(web, 'src', 'lib', 'ml');
const to = join(web, '..', 'mobile-kit', 'ml');

mkdirSync(to, { recursive: true });
for (const file of KIT_FILES) {
  copyFileSync(join(from, file), join(to, file));
  console.log(`mobile-kit/ml/${file}`);
}
