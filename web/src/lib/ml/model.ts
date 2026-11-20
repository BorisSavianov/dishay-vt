// The model served by /api/model and /api/predict: web/src/model/model.json, written by `python -m ml.train`.
// It is bundled with the app, so swapping models is: train, commit model.json, deploy.
import bundled from '@/model/model.json';
import type { Predictor } from './predict';
import type { ModelInfo, ModelRef } from './types';

export type ModelArtifact = ModelInfo & Predictor;

export function isModelArtifact(v: unknown): v is ModelArtifact {
  const m = v as Partial<ModelArtifact> | null;
  return (
    typeof m === 'object' &&
    m !== null &&
    m.schema_version === 1 &&
    (m.task === 'regression' || m.task === 'classification') &&
    Array.isArray(m.features) &&
    Array.isArray(m.columns) &&
    typeof m.estimator === 'object' &&
    m.estimator !== null
  );
}

export function loadModel(source: unknown = bundled): ModelArtifact | null {
  return isModelArtifact(source) ? source : null;
}

export function modelInfo(m: ModelArtifact): ModelInfo {
  const { columns: _columns, estimator: _estimator, ...info } = m;
  return info;
}

export function modelRef(m: ModelArtifact): ModelRef {
  return { name: m.name, version: m.version, kind: m.kind, algorithm: m.algorithm, unit: m.target.unit ?? null };
}
