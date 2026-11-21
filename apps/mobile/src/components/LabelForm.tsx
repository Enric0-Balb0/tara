import { type ComponentRef, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { BaseUnit } from '@/domain/food';
import { type FoodTexts, LABEL_FIELDS } from '@/domain/foodForm';
import { formatNumber } from '@/domain/format';
import { labelColors } from '@/theme/colors';
import { radius, space, touch } from '@/theme/layout';
import { textStyles } from '@/theme/typography';

import { TaraText } from './TaraText';

interface Props {
  unit: BaseUnit;
  texts: FoodTexts;
  /** Messaggi per codice di nutriente, sotto la riga. */
  errors: Readonly<Record<string, string>>;
  /** I valori letti: un campo vuoto con un valore ricavato (i kJ dalle kcal) lo suggerisce. */
  values: Readonly<Record<string, number>>;
  onChange: (code: string, text: string) => void;
}

/**
 * L'etichetta da compilare (RF-18): lo stesso foglio bianco della scheda, con le righe
 * nell'ordine della confezione, così si copia riga per riga senza cercare il campo.
 * "Avanti" sulla tastiera passa alla riga sotto; toccare un valore lo seleziona tutto.
 */
export function LabelForm({ unit, texts, errors, values, onChange }: Props) {
  const inputs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);
  const last = LABEL_FIELDS.length - 1;
  return (
    <View style={styles.label}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <TaraText variant="section" color="ink">
            Valori nutrizionali medi
          </TaraText>
          <TaraText variant="caption" color="secondary">
            copiali dalla confezione
          </TaraText>
        </View>
        <TaraText variant="caption" color="secondary">
          per 100 {unit}
        </TaraText>
      </View>
      <View style={styles.thick} />
      {LABEL_FIELDS.map((field, index) => {
        const error = errors[field.code];
        const derived = values[field.code];
        const placeholder =
          (texts[field.code] ?? '').trim() === '' && derived !== undefined
            ? `≈ ${formatNumber(derived, 0)}`
            : undefined;
        return (
          <View
            key={field.code}
            style={[styles.row, index === last ? styles.lastRow : styles.thinRow]}
          >
            <View style={styles.line}>
              <TaraText
                variant={field.sub ? 'body' : 'bodyStrong'}
                color="ink"
                style={[styles.name, field.sub ? styles.sub : null]}
              >
                {field.label}
              </TaraText>
              <TextInput
                ref={(input) => {
                  inputs.current[index] = input;
                }}
                testID={`campo-${field.code}`}
                accessibilityLabel={`${field.label === 'kcal' ? 'Energia in kcal' : field.label}, ${field.unit} per 100 ${unit}`}
                value={texts[field.code] ?? ''}
                placeholder={placeholder}
                placeholderTextColor={labelColors.secondary}
                onChangeText={(text) => onChange(field.code, text)}
                keyboardType="decimal-pad"
                // Toccare un valore già scritto lo seleziona: si corregge riscrivendolo.
                selectTextOnFocus
                returnKeyType={index === last ? 'done' : 'next'}
                submitBehavior={index === last ? 'blurAndSubmit' : 'submit'}
                onSubmitEditing={() => inputs.current[index + 1]?.focus()}
                selectionColor={labelColors.ink}
                cursorColor={labelColors.ink}
                maxFontSizeMultiplier={1.3}
                style={[
                  styles.input,
                  {
                    borderColor: error ? labelColors.labelError : labelColors.secondary,
                    fontFamily: textStyles.number.fontFamily,
                    fontSize: textStyles.number.fontSize,
                  },
                ]}
              />
              <TaraText variant="caption" color="secondary" style={styles.unit}>
                {field.unit}
              </TaraText>
            </View>
            {error ? (
              <TaraText variant="caption" color="labelError" style={styles.error}>
                {error}
              </TaraText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    backgroundColor: labelColors.paper,
    borderRadius: radius.label,
    padding: space.m,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: space.s,
  },
  titles: { flexShrink: 1 },
  thick: {
    height: 6,
    backgroundColor: labelColors.ink,
    marginTop: space.s,
    marginBottom: space.xs,
  },
  row: { paddingVertical: space.xs, borderColor: labelColors.ink },
  thinRow: { borderBottomWidth: 1 },
  lastRow: { borderBottomWidth: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  name: { flex: 1 },
  sub: { paddingLeft: 14 },
  input: {
    width: 96,
    minHeight: touch.min,
    borderWidth: 1,
    borderRadius: radius.field,
    paddingHorizontal: space.s,
    textAlign: 'right',
    color: labelColors.ink,
    fontVariant: ['tabular-nums'],
  },
  unit: { width: 32 },
  error: { paddingLeft: 14, paddingTop: space.xs },
});
