import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, CardTitle, Note } from '../components/Card';
import { Screen } from '../components/Screen';
import { useColors } from '../lib/color-mode';
import { useLang } from '../lib/lang';
import { mlClient } from '../lib/ml';
import { ui } from '../lib/ui-strings';
import { fmtNum } from '../shared/format';
import { t, type MessageKey } from '../shared/i18n';
import type { Lang } from '../shared/types';
import { usePrediction, useModelInfo } from '../ml/usePrediction';
import { isClassPrediction, type DecisionStep, type FeatureSpec, type InputRow } from '../ml/types';

const OTHER = '__other__';

function fmt(lang: Lang, n: number): string {
  return fmtNum(lang, n, Math.abs(n) >= 100 ? 0 : 2);
}

export default function Predict() {
  const { lang } = useLang();
  const c = useColors();
  const router = useRouter();
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
  const model = useModelInfo(mlClient);
  const { state, predict } = usePrediction(mlClient);
  const [values, setValues] = useState<Record<string, string>>({});

  const label = (value: string) => (value === OTHER ? tr('predict.form.other') : value);

  function stepText(step: DecisionStep): string {
    if ('threshold' in step) {
      const op = step.op === '<=' ? '≤' : '>';
      return `${step.feature} ${op} ${fmt(lang, step.threshold)} (${tr('predict.path.yours', { value: fmt(lang, step.input) })})`;
    }
    const op = step.op === '=' ? '=' : '≠';
    return `${step.feature} ${op} ${label(step.value)} (${tr('predict.path.yours', { value: label(step.input) })})`;
  }

  function submit() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const row: InputRow = {};
    for (const [name, value] of Object.entries(values)) if (value.trim() !== '') row[name] = value;
    void predict(row);
  }

  function field(f: FeatureSpec) {
    const value = values[f.name] ?? '';
    return (
      <View key={f.name} style={styles.field}>
        <Text style={[styles.fieldName, { color: c.fg }]}>{f.name}</Text>
        {f.type === 'number' ? (
          <>
            <TextInput
              value={value}
              onChangeText={(text) => setValues({ ...values, [f.name]: text })}
              placeholder={tr('predict.form.typical', { value: fmt(lang, f.impute) })}
              placeholderTextColor={c.muted}
              keyboardType="decimal-pad"
              accessibilityLabel={f.name}
              style={[styles.input, { backgroundColor: c.card2, borderColor: c.line, color: c.fg }]}
            />
            {f.min !== null && f.max !== null ? (
              <Text style={[styles.hint, { color: c.muted }]}>
                {tr('predict.form.range', { min: fmt(lang, f.min), max: fmt(lang, f.max) })}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {f.categories.map((category) => {
                const on = value === category;
                return (
                  <Pressable
                    key={category}
                    onPress={() => setValues({ ...values, [f.name]: on ? '' : category })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.chip, { borderColor: c.line, backgroundColor: on ? c.accent : c.card2 }]}
                  >
                    <Text style={{ color: on ? c.onAccent : c.fg, fontWeight: '600' }}>{label(category)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.hint, { color: c.muted }]}>
              {tr('predict.form.typical', { value: label(f.impute) })}
            </Text>
          </>
        )}
      </View>
    );
  }

  const info = model.status === 'done' ? model.data : null;
  const result = state.status === 'done' ? state.data : null;
  const prediction = result?.predictions[0];
  const metricNames = info ? [...new Set([...Object.keys(info.metrics.model), ...Object.keys(info.metrics.baseline)])] : [];
  const show = (v: number | null | undefined) => (typeof v === 'number' ? fmtNum(lang, v, 3) : '–');

  return (
    <Screen title={tr('predict.title')} lead={tr('predict.lead')}>
      <Pressable
        onPress={() => router.navigate('/data')}
        accessibilityRole="button"
        style={styles.back}
        hitSlop={8}
      >
        <Text style={[styles.backText, { color: c.accentStrong }]}>‹ {tr('tab.data')}</Text>
      </Pressable>

      {model.status === 'loading' && (
        <View style={styles.row}>
          <ActivityIndicator color={c.muted} />
          <Text style={{ color: c.muted }}>{ui(lang, 'ml.loading')}</Text>
        </View>
      )}

      {model.status === 'error' && (
        <Card>
          <Text style={{ color: c.neg, fontSize: 15 }}>{tr('predict.error', { message: model.error.message })}</Text>
          <Pressable
            onPress={model.reload}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: c.accent }]}
          >
            <Text style={[styles.buttonText, { color: c.onAccent }]}>{ui(lang, 'ml.retry')}</Text>
          </Pressable>
        </Card>
      )}

      {info && (
        <>
          {info.kind === 'fixture' && (
            <Card soft>
              <Text style={{ color: c.warn, fontSize: 14.5, lineHeight: 21 }}>{tr('predict.fixture')}</Text>
            </Card>
          )}

          <Card>
            <CardTitle title={tr('predict.form.title')} />
            {info.features.map(field)}
            <Pressable
              onPress={submit}
              disabled={state.status === 'loading'}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: c.accent },
                (pressed || state.status === 'loading') && styles.pressed,
              ]}
            >
              <Text style={[styles.buttonText, { color: c.onAccent }]}>
                {state.status === 'loading' ? tr('predict.loading') : tr('predict.button')}
              </Text>
            </Pressable>
          </Card>

          <Card>
            <CardTitle title={tr('predict.result')} />
            <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
              {state.status === 'error' && (
                <Text style={{ color: c.neg, fontSize: 15, lineHeight: 22 }}>
                  {tr('predict.error', { message: state.error.message })}
                  {state.error.details.length > 0
                    ? ` (${state.error.details.map((d) => `${d.field ?? ''} ${d.issue}`).join('; ')})`
                    : ''}
                </Text>
              )}
              {state.status !== 'error' && !prediction && <Note>{tr('predict.empty')}</Note>}
              {prediction &&
                (isClassPrediction(prediction) ? (
                  <>
                    <Text style={[styles.big, { color: c.fg }]}>{prediction.label}</Text>
                    {Object.entries(prediction.probabilities)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([name, p]) => (
                        <Bar key={name} name={name} share={p} text={`${fmtNum(lang, p * 100, 1)}%`} />
                      ))}
                  </>
                ) : (
                  <>
                    <Text style={[styles.big, { color: c.fg }]} adjustsFontSizeToFit numberOfLines={1}>
                      {fmt(lang, prediction.value)}
                    </Text>
                    {info.target.unit ? <Text style={{ color: c.muted, fontSize: 14 }}>{info.target.unit}</Text> : null}
                  </>
                ))}
              {result?.explanations?.[0] && (
                <View style={{ gap: 6 }}>
                  <Text style={[styles.sub, { color: c.fg }]}>{tr('predict.path')}</Text>
                  {result.explanations[0].map((step, i) => (
                    <Text key={i} style={[styles.body, { color: c.muted }]}>
                      {i + 1}. {stepText(step)}
                    </Text>
                  ))}
                </View>
              )}
              {result && result.warnings.length > 0 && (
                <View style={{ gap: 4 }}>
                  <Text style={[styles.sub, { color: c.fg }]}>
                    {tr('predict.warnings')} ({result.warnings.length})
                  </Text>
                  {result.warnings.map((w, i) => (
                    <Note key={i}>
                      {w.field}: {w.issue}
                    </Note>
                  ))}
                </View>
              )}
              {result && (
                <View style={[styles.badge, { backgroundColor: c.accentSoft }]}>
                  <Text style={[styles.badgeText, { color: c.accentStrong }]}>
                    {result.model.name} · {result.model.version}
                  </Text>
                </View>
              )}
            </View>
          </Card>

          <Card>
            <CardTitle
              title={tr('predict.model.title')}
              sub={`${info.target.name}: ${tr('predict.model.algorithm', { algorithm: info.algorithm, version: info.version })}`}
            />
            <View style={{ gap: 6 }}>
              <View style={styles.metricRow}>
                <Text style={[styles.metricName, styles.metricHead, { color: c.muted }]}>{tr('predict.metrics.metric')}</Text>
                <Text style={[styles.metricValue, styles.metricHead, { color: c.muted }]}>{tr('predict.metrics.model')}</Text>
                <Text style={[styles.metricValue, styles.metricHead, { color: c.muted }]}>
                  {tr('predict.metrics.baseline')}
                </Text>
              </View>
              {metricNames.map((m) => (
                <View key={m} style={[styles.metricRow, { borderTopColor: c.line }]}>
                  <Text style={[styles.metricName, { color: c.fg }]}>{m}</Text>
                  <Text style={[styles.metricValue, { color: c.fg }]}>{show(info.metrics.model[m])}</Text>
                  <Text style={[styles.metricValue, { color: c.fg }]}>{show(info.metrics.baseline[m])}</Text>
                </View>
              ))}
            </View>
            <Note>{tr('predict.metrics.note', { test: info.metrics.rows.test })}</Note>
            <Text style={[styles.sub, { color: c.fg }]}>{tr('predict.importance')}</Text>
            {info.importances.slice(0, 5).map((imp) => (
              <Bar key={imp.feature} name={imp.feature} share={imp.value} text={`${fmtNum(lang, imp.value * 100, 0)}%`} />
            ))}
            <Note>{tr('source.line', { source: info.meta.source, asof: info.meta.as_of, license: info.meta.license })}</Note>
          </Card>
        </>
      )}
    </Screen>
  );

  function Bar({ name, share, text }: { name: string; share: number; text: string }) {
    return (
      <View style={styles.barRow} accessible accessibilityLabel={`${name}: ${text}`}>
        <Text style={[styles.barName, { color: c.fg }]} numberOfLines={1}>
          {name}
        </Text>
        <View style={[styles.track, { backgroundColor: c.accentSoft }]}>
          <View style={[styles.fill, { backgroundColor: c.accent, width: `${Math.max(Math.round(share * 100), 1)}%` }]} />
        </View>
        <Text style={[styles.barText, { color: c.muted }]}>{text}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { gap: 6 },
  fieldName: { fontSize: 14, fontWeight: '700' },
  input: { minHeight: 46, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, fontSize: 16 },
  hint: { fontSize: 12.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  button: { alignSelf: 'flex-start', minHeight: 46, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 14 },
  pressed: { opacity: 0.75 },
  buttonText: { fontWeight: '700', fontSize: 15 },
  big: { fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  sub: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 14.5, lineHeight: 21 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  badgeText: { fontSize: 12.5, fontWeight: '600' },
  metricRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'transparent' },
  metricHead: { fontSize: 12.5, fontWeight: '600' },
  metricName: { flex: 1.2, fontSize: 14.5, fontWeight: '600' },
  metricValue: { flex: 1, fontSize: 14.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barName: { width: '24%', fontSize: 14 },
  track: { flex: 1, height: 10, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  barText: { width: 52, textAlign: 'right', fontSize: 13, fontVariant: ['tabular-nums'] },
});
