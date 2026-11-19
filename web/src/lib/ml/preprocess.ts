// Mirror of ml/preprocess.py. Keep the two in step; the parity test in predict.test.ts checks them.
import type { FeatureSpec, InputValue } from './types';

export const OTHER = '__other__';

export type EncodedColumn =
  | { feature: string; op: 'num'; center: number; scale: number }
  | { feature: string; op: 'eq'; value: string };

// Every feature present, missing values imputed, categories normalised.
export type PreparedRow = Record<string, number | string>;

// Accepts numbers and numeric text from form fields: "12.5", "12,5", "1 200".
export function toNumber(value: InputValue | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let text = value.trim().replace(/[\s ]/g, '');
  if (text === '') return null;
  if ((text.match(/,/g) ?? []).length === 1 && !text.includes('.')) text = text.replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function toCategory(value: InputValue | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = String(value).trim();
  return text === '' ? null : text;
}

export function isMissing(value: InputValue | undefined): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

// Call after validation: a value that is present but unparsable is treated as missing here.
export function prepareRow(features: FeatureSpec[], row: Record<string, InputValue | undefined>): PreparedRow {
  const out: PreparedRow = {};
  for (const f of features) {
    if (f.type === 'number') {
      out[f.name] = toNumber(row[f.name]) ?? f.impute;
    } else {
      let v = toCategory(row[f.name]) ?? f.impute;
      if (!f.categories.includes(v) && f.categories.includes(OTHER)) v = OTHER;
      out[f.name] = v;
    }
  }
  return out;
}

export function encode(columns: EncodedColumn[], row: PreparedRow): number[] {
  return columns.map((c) =>
    c.op === 'num' ? ((row[c.feature] as number) - c.center) / c.scale : row[c.feature] === c.value ? 1 : 0,
  );
}
