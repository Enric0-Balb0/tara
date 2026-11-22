import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatTargetInput } from '@/domain/targets';
import { MAX_INCREMENT, MAX_INCREMENTS, MIN_INCREMENT, parseIncrements } from '@/domain/water';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';
import { TextField } from './TextField';

interface Props {
  /** Prefisso dei testID dei campi (es. "incrementi" dà "incrementi-0"), per i flussi Maestro. */
  testID: string;
  increments: readonly number[];
  onSave: (values: number[]) => Promise<void>;
}

/**
 * Gli incrementi dei pulsanti dell'acqua in Oggi (RF-60): fino a tre valori in ml. Un campo
 * vuoto si salta; ne serve almeno uno.
 */
export function WaterIncrements({ testID, increments, onSave }: Props) {
  const { colors } = useTheme();
  const [texts, setTexts] = useState<string[]>(() =>
    Array.from({ length: MAX_INCREMENTS }, (_, i) => formatTargetInput(increments[i] ?? null)),
  );
  const [saving, setSaving] = useState(false);
  const parsed = parseIncrements(texts);
  const changed = parsed === undefined || parsed.join(',') !== increments.join(',');

  async function save() {
    if (parsed === undefined) return;
    setSaving(true);
    try {
      await onSave(parsed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.intro}>
        <TaraText variant="section" accessibilityRole="header">
          Incrementi dell&apos;acqua
        </TaraText>
        <TaraText variant="caption" color="textSecondary">
          I pulsanti di Oggi: da uno a tre valori in ml, da {MIN_INCREMENT} a {MAX_INCREMENT}.
        </TaraText>
      </View>
      <View style={styles.row}>
        {texts.map((text, index) => (
          <View key={index} style={styles.cell}>
            <TextField
              label={`Incremento ${index + 1} (ml)`}
              testID={`${testID}-${index}`}
              value={text}
              onChangeText={(next) =>
                setTexts((current) => current.map((value, i) => (i === index ? next : value)))
              }
              keyboardType="number-pad"
              invalid={text.trim() !== '' && parseIncrements([text]) === undefined}
              placeholder="–"
            />
          </View>
        ))}
      </View>
      {parsed === undefined ? (
        <TaraText variant="caption" color="error">
          Scrivi interi tra {MIN_INCREMENT} e {MAX_INCREMENT}, almeno uno.
        </TaraText>
      ) : null}
      <PressableScale
        onPress={() => void save()}
        disabled={parsed === undefined || !changed || saving}
        accessibilityLabel="Salva gli incrementi dell'acqua"
        style={[styles.button, { backgroundColor: colors.action }]}
      >
        <TaraText variant="bodyStrong" color="background">
          Salva
        </TaraText>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.panel, borderWidth: 1, padding: space.l, gap: space.m },
  intro: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.m },
  cell: { flex: 1 },
  button: {
    minHeight: touch.min,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
