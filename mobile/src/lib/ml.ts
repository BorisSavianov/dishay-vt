import { createMlClient } from '../ml/client';
import { API_BASE } from './api';

// One client for the app: the hosted site serves /api/model and /api/predict.
export const mlClient = createMlClient({ baseUrl: API_BASE });
