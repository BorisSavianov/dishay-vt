# Mobile kit: ML API for the mobile app

Drop-in files for Boris's app. The mobile app calls the same public API as the web app. The model runs on the server (Vercel); the phone only sends inputs and shows the answer.

| File | What it is |
| --- | --- |
| `ml/types.ts` | Request and response types (the contract in `contract/CONTRACT.md`) |
| `ml/client.ts` | `createMlClient({ baseUrl })`: `getModel()`, `predict(row)`, `predictMany(rows)`; throws `MlApiError` with a `code` |
| `ml/usePrediction.ts` | React hooks `useModelInfo(client)` and `usePrediction(client)` with idle / loading / error / done states |

These files are copies of `web/src/lib/ml/`. Do not edit them here. Change the web files, run `pnpm ml:kit` in `web/`, and copy again. `pnpm test` fails if the copies drift.

## Set up (Expo)

1. Copy `mobile-kit/ml/` into the app, e.g. `src/ml/`. No packages to install: it uses `fetch` and React only.
2. Set the API origin in the app's `.env`:

   ```bash
   EXPO_PUBLIC_API_URL=https://<our-app>.vercel.app
   ```

   `EXPO_PUBLIC_` values are bundled into the app, which is fine here: the URL is public and the API has no keys. Never put a secret in an `EXPO_PUBLIC_` variable.
3. Local web server instead of Vercel: `pnpm dev` in `web/`, then use the laptop's LAN IP (`http://192.168.x.x:3000`), not `localhost`. Phone and laptop must be on the same network. The Android emulator reaches the laptop at `http://10.0.2.2:3000`.

## Minimal screen

```tsx
import { useMemo, useState } from 'react';
import { ActivityIndicator, Button, Text, TextInput, View } from 'react-native';
import { createMlClient } from './ml/client';
import { isClassPrediction, type InputRow } from './ml/types';
import { useModelInfo, usePrediction } from './ml/usePrediction';

const client = createMlClient({ baseUrl: process.env.EXPO_PUBLIC_API_URL ?? '' });

export function PredictScreen() {
  const model = useModelInfo(client);
  const { state, predict } = usePrediction(client);
  const [values, setValues] = useState<Record<string, string>>({});

  if (model.status === 'loading') return <ActivityIndicator />;
  if (model.status !== 'done') return <Button title="Retry" onPress={model.reload} />;

  const row: InputRow = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''));
  const prediction = state.status === 'done' ? state.data.predictions[0] : undefined;

  return (
    <View style={{ padding: 16, gap: 8 }}>
      {model.data.kind === 'fixture' && <Text>Placeholder model (toy data)</Text>}
      {model.data.features.map((f) => (
        <TextInput
          key={f.name}
          placeholder={`${f.name} (typical: ${f.impute})`}
          keyboardType={f.type === 'number' ? 'decimal-pad' : 'default'}
          value={values[f.name] ?? ''}
          onChangeText={(text) => setValues({ ...values, [f.name]: text })}
        />
      ))}
      <Button title="Predict" disabled={state.status === 'loading'} onPress={() => predict(row)} />
      {state.status === 'error' && <Text>{state.error.code}: {state.error.message}</Text>}
      {prediction && (
        <Text style={{ fontSize: 28 }}>
          {isClassPrediction(prediction) ? prediction.label : prediction.value.toFixed(2)}
        </Text>
      )}
    </View>
  );
}
```

Notes:

- Number fields may send text: `"12,5"` and `"1 200"` are read as numbers. Empty fields are left out and the server fills in the typical value.
- Category features have a fixed list in `model.data.features[i].categories`; a picker is better than free text. `__other__` means "anything else".
- `state.data.explanations?.[0]` lists the decision-tree steps when the model is a single tree.
- Error codes: `invalid_input` (see `error.details` for row and field), `invalid_json`, `too_large`, `model_unavailable`, and client-side `network`, `timeout`, `bad_response`.
- The feature list comes from `/api/model`, so a new model on the day needs no app change unless the screen hard-codes field names.
