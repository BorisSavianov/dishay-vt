import { apiError, json, preflight } from '@/lib/ml/http';
import { loadModel, modelRef } from '@/lib/ml/model';
import { predictRows } from '@/lib/ml/predict';
import type { PredictResponse } from '@/lib/ml/types';
import { MAX_BODY_BYTES, validateRequest } from '@/lib/ml/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Body: {"inputs": {...}} or {"inputs": [{...}, ...]} (1 to 100 rows). Shapes: contract/CONTRACT.md.
export async function POST(req: Request) {
  const model = loadModel();
  if (!model) return apiError(503, 'model_unavailable', 'No valid model is loaded.');
  const tooLarge = () => apiError(413, 'too_large', `Body is over ${MAX_BODY_BYTES} bytes.`);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return tooLarge();
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return tooLarge();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return apiError(400, 'invalid_json', 'Body is not valid JSON.');
  }
  const checked = validateRequest(model.features, body);
  if (!checked.ok) return apiError(400, 'invalid_input', checked.message, checked.details);

  const { predictions, explanations } = predictRows(model, checked.rows);
  const response: PredictResponse = {
    ok: true,
    task: model.task,
    predictions,
    ...(explanations ? { explanations } : {}),
    warnings: checked.warnings,
    model: modelRef(model),
  };
  return json(response);
}

export function OPTIONS() {
  return preflight();
}
