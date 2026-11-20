// Evaluates models exported by ml/export.py. Mirrors scikit-learn's predict / predict_proba.
import { encode, type EncodedColumn, type PreparedRow } from './preprocess';
import type { DecisionStep, FeatureSpec, Prediction, Task } from './types';

export type Tree = {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  value: (number[] | null)[];
};

export type Estimator =
  | { type: 'trees'; combine: 'mean'; outputs: number; link: 'identity' | 'proba'; trees: Tree[] }
  | {
      type: 'trees';
      combine: 'boost';
      outputs: number;
      link: 'identity' | 'sigmoid' | 'softmax';
      learning_rate: number;
      base: number[];
      trees: Tree[];
    }
  | { type: 'linear'; link: 'identity' | 'sigmoid' | 'softmax'; coef: number[][]; intercept: number[] };

// The parts of model.json needed to predict.
export type Predictor = {
  task: Task;
  target: { classes?: string[] };
  features: FeatureSpec[];
  columns: EncodedColumn[];
  estimator: Estimator;
};

type Visit = { node: number; left: boolean };

// scikit-learn casts inputs to float32 before comparing with float64 thresholds.
function leaf(tree: Tree, x: number[], path?: Visit[]): number[] {
  let node = 0;
  while (tree.left[node] !== -1) {
    const goLeft = Math.fround(x[tree.feature[node]!]!) <= tree.threshold[node]!;
    path?.push({ node, left: goLeft });
    node = goLeft ? tree.left[node]! : tree.right[node]!;
  }
  const value = tree.value[node];
  if (!value) throw new Error(`model.json: leaf ${node} has no value`);
  return value;
}

function rawScores(est: Estimator, x: number[]): number[] {
  if (est.type === 'linear') {
    return est.coef.map((row, k) => row.reduce((sum, c, j) => sum + c * x[j]!, est.intercept[k]!));
  }
  if (est.combine === 'mean') {
    const sum = new Array<number>(est.outputs).fill(0);
    for (const tree of est.trees) {
      const v = leaf(tree, x);
      for (let k = 0; k < est.outputs; k++) sum[k]! += v[k]!;
    }
    return sum.map((s) => s / est.trees.length);
  }
  const out = est.base.slice();
  est.trees.forEach((tree, i) => {
    out[i % est.outputs]! += est.learning_rate * leaf(tree, x)[0]!;
  });
  return out;
}

function probabilities(link: Estimator['link'], raw: number[]): number[] {
  if (link === 'sigmoid') {
    const p = 1 / (1 + Math.exp(-raw[0]!));
    return [1 - p, p];
  }
  if (link === 'softmax') {
    const max = Math.max(...raw);
    const exps = raw.map((r) => Math.exp(r - max));
    const total = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / total);
  }
  return raw;
}

function argmax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  return best;
}

function explain(model: Predictor, tree: Tree, x: number[], row: PreparedRow): DecisionStep[] {
  const path: Visit[] = [];
  leaf(tree, x, path);
  return path.map(({ node, left }): DecisionStep => {
    const col = model.columns[tree.feature[node]!]!;
    if (col.op === 'num') {
      return {
        feature: col.feature,
        op: left ? '<=' : '>',
        threshold: tree.threshold[node]! * col.scale + col.center,
        input: row[col.feature] as number,
      };
    }
    // One-hot column: left (x <= 0.5) means the value is not this category.
    return { feature: col.feature, op: left ? '!=' : '=', value: col.value, input: row[col.feature] as string };
  });
}

export function predictOne(model: Predictor, row: PreparedRow): Prediction {
  const est = model.estimator;
  const raw = rawScores(est, encode(model.columns, row));
  if (model.task === 'regression') return { value: raw[0]! };
  const classes = model.target.classes ?? [];
  const probs = probabilities(est.link, raw);
  const probabilitiesByClass: Record<string, number> = {};
  classes.forEach((c, i) => (probabilitiesByClass[c] = probs[i]!));
  return { label: classes[argmax(probs)]!, probabilities: probabilitiesByClass };
}

export function predictRows(
  model: Predictor,
  rows: PreparedRow[],
): { predictions: Prediction[]; explanations?: DecisionStep[][] } {
  const predictions = rows.map((r) => predictOne(model, r));
  const est = model.estimator;
  const single = est.type === 'trees' && est.combine === 'mean' && est.trees.length === 1 ? est.trees[0] : undefined;
  if (!single) return { predictions };
  return { predictions, explanations: rows.map((r) => explain(model, single, encode(model.columns, r), r)) };
}
