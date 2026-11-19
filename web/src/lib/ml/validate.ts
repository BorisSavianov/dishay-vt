import { isMissing, OTHER, prepareRow, toCategory, toNumber, type PreparedRow } from './preprocess';
import type { FeatureSpec, InputRow, Issue } from './types';

export const MAX_ROWS = 100;
export const MAX_BODY_BYTES = 32 * 1024;
const MAX_ISSUES = 50;

export type Validated =
  | { ok: true; rows: PreparedRow[]; warnings: Issue[] }
  | { ok: false; message: string; details: Issue[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const SHAPE = 'Body must be {"inputs": {...}} or {"inputs": [{...}, ...]}.';

export function validateRequest(features: FeatureSpec[], body: unknown): Validated {
  if (!isPlainObject(body) || !('inputs' in body)) return { ok: false, message: SHAPE, details: [] };
  const inputs = body.inputs;
  const list = Array.isArray(inputs) ? inputs : [inputs];
  if (list.length === 0 || list.length > MAX_ROWS) {
    return { ok: false, message: `Send between 1 and ${MAX_ROWS} rows.`, details: [] };
  }
  const byName = new Map(features.map((f) => [f.name, f]));
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const add = (into: Issue[], issue: Issue) => {
    if (into.length < MAX_ISSUES) into.push(issue);
  };

  list.forEach((row, i) => {
    if (!isPlainObject(row)) {
      add(errors, { row: i, issue: 'row must be an object of feature values' });
      return;
    }
    for (const key of Object.keys(row)) {
      if (!byName.has(key)) add(errors, { row: i, field: key, issue: 'unknown feature' });
    }
    for (const f of features) {
      const value = row[f.name];
      if (isMissing(value as InputRow[string])) {
        if (f.required) add(errors, { row: i, field: f.name, issue: 'required' });
        else add(warnings, { row: i, field: f.name, issue: `missing, used ${f.impute}` });
        continue;
      }
      if (f.type === 'number') {
        const ok = (typeof value === 'number' || typeof value === 'string') && toNumber(value) !== null;
        if (!ok) add(errors, { row: i, field: f.name, issue: 'expected a number' });
        continue;
      }
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        add(errors, { row: i, field: f.name, issue: 'expected text' });
        continue;
      }
      const v = toCategory(value as string | number | boolean);
      if (v !== null && !f.categories.includes(v)) {
        const used = f.categories.includes(OTHER) ? `treated as "${OTHER}"` : 'matches no known category';
        add(warnings, { row: i, field: f.name, issue: `unseen value "${v}", ${used}` });
      }
    }
  });

  if (errors.length > 0) return { ok: false, message: 'Some inputs are not valid.', details: errors };
  return { ok: true, rows: (list as InputRow[]).map((r) => prepareRow(features, r)), warnings };
}
