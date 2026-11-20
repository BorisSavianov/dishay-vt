import { describe, expect, it } from 'vitest';
import parity from './__fixtures__/parity.json';
import { loadModel } from './model';
import { predictRows, type Predictor } from './predict';
import { prepareRow } from './preprocess';
import type { ClassPrediction, InputRow, RegressionPrediction } from './types';

type ParitySet = {
  name: string;
  model: Predictor;
  cases: { input: InputRow; expected: RegressionPrediction | ClassPrediction }[];
};

const sets = (parity as unknown as { sets: ParitySet[] }).sets;

function close(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected));
}

describe('parity with scikit-learn', () => {
  it('covers every exported estimator type', () => {
    expect(sets.length).toBeGreaterThanOrEqual(12);
  });

  for (const set of sets) {
    it(`${set.name}: same predictions as scikit-learn`, () => {
      const rows = set.cases.map((c) => prepareRow(set.model.features, c.input));
      const { predictions } = predictRows(set.model, rows);
      set.cases.forEach((c, i) => {
        const got = predictions[i]!;
        if ('value' in c.expected) {
          expect(close((got as RegressionPrediction).value, c.expected.value), `${set.name} case ${i}`).toBe(true);
        } else {
          const p = got as ClassPrediction;
          expect(p.label, `${set.name} case ${i}`).toBe(c.expected.label);
          for (const [cls, prob] of Object.entries(c.expected.probabilities)) {
            expect(close(p.probabilities[cls]!, prob), `${set.name} case ${i} ${cls}`).toBe(true);
          }
        }
      });
    });
  }
});

describe('explanations', () => {
  it('returns one decision path per row for a single tree, ending at the predicted leaf', () => {
    const set = sets.find((s) => s.name === 'tree-multiclass')!;
    const rows = set.cases.slice(0, 3).map((c) => prepareRow(set.model.features, c.input));
    const { explanations } = predictRows(set.model, rows);
    expect(explanations).toHaveLength(3);
    for (const path of explanations!) {
      expect(path.length).toBeGreaterThan(0);
      for (const step of path) {
        if (step.op === '<=') expect(step.input).toBeLessThanOrEqual(step.threshold + 1e-6);
        if (step.op === '>') expect(step.input).toBeGreaterThan(step.threshold - 1e-6);
      }
    }
  });

  it('is absent for ensembles', () => {
    const set = sets.find((s) => s.name === 'forest-regression')!;
    const { explanations } = predictRows(set.model, [prepareRow(set.model.features, {})]);
    expect(explanations).toBeUndefined();
  });
});

describe('bundled model', () => {
  it('loads and predicts from an empty row by imputing every feature', () => {
    const model = loadModel();
    expect(model).not.toBeNull();
    const { predictions } = predictRows(model!, [prepareRow(model!.features, {})]);
    expect(predictions).toHaveLength(1);
  });

  it('rejects something that is not a model', () => {
    expect(loadModel({ schema_version: 2 })).toBeNull();
  });
});
