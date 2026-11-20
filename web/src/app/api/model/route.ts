import { apiError, json, preflight } from '@/lib/ml/http';
import { loadModel, modelInfo } from '@/lib/ml/model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The loaded model's inputs, metrics and provenance. Clients build their forms from `features`.
export function GET() {
  const model = loadModel();
  if (!model) return apiError(503, 'model_unavailable', 'No valid model is loaded.');
  return json({ ok: true, model: modelInfo(model) });
}

export function OPTIONS() {
  return preflight();
}
