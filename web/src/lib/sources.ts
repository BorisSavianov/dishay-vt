import { t } from './i18n';
import type { Lang, Meta } from './types';

// The source and licence line shown under every data view.
export function sourceLine(lang: Lang, meta: Meta): string {
  return t(lang, 'source.line', { source: meta.source, asof: meta.as_of, license: meta.license });
}
