import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatAmount } from '@/domain/format';
import {
  formatTargetInput,
  macroKcalCheck,
  type MacroTargets,
  parseTargetInput,
} from '@/domain/targets';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';
import { TextField } from './TextField';

const FIELDS: readonly { key: keyof MacroTargets; label: string }[] = [
  { key: 'kcal', label: 'kcal' },
  { key: 'protein_g', label: 'Proteine (g)' },
  { key: 'carbs_g', label: 'Carboidrati (g)' },
  { key: 'fat_g', label: 'Grassi (g)' },
];

const EMPTY: MacroTargets = { kcal: null, protein_g: null, carbs_g: null, fat_g: null };

interface Props {
  /** Prefisso dei testID dei campi (es. "tipo-0" dà "tipo-0-kcal"), per i flussi Maestro. */
  testID: string;
  name: string;
  /** Il target in vigore oggi; undefined se il tipo non ne ha ancora uno. */
  target: MacroTargets | undefined;
  /** Il target dell'acqua in ml; null se non impostato (RF-61). */
  water: number | null;
  canDelete: boolean;
  onSave: (name: string, values: MacroTargets, water: number | null) => Promise<void>;
  onDelete: () => void;
}

type Texts = Record<keyof MacroTargets, string>;

function textsOf(target: MacroTargets): Texts {
  return {
    kcal: formatTargetInput(target.kcal),
    protein_g: formatTargetInput(target.protein_g),
    carbs_g: formatTargetInput(target.carbs_g),
    fat_g: formatTargetInput(target.fat_g),
  };
}

/**
 * Un tipo di giornata nel Piano (RF-50): nome e target di kcal e macro. Un campo vuoto è un
 * target non impostato; se i macro non tornano con le kcal lo dice, senza bloccare.
 */
export function DayTypeCard({ testID, name, target, water, canDelete, onSave, onDelete }: Props) {
  const { colors } = useTheme();
  const saved = target ?? EMPTY;
  const [nameText, setNameText] = useState(name);
  const [texts, setTexts] = useState<Texts>(() => textsOf(saved));
  const [waterText, setWaterText] = useState(() => formatTargetInput(water));
  const [saving, setSaving] = useState(false);

  const parsed = Object.fromEntries(
    FIELDS.map((field) => [field.key, parseTargetInput(texts[field.key])]),
  ) as Record<keyof MacroTargets, number | null | undefined>;
  const parsedWater = parseTargetInput(waterText);
  // L'acqua è un target come gli altri, ma zero non vale: vuoto vuol dire non impostato.
  const waterInvalid = parsedWater === undefined || parsedWater === 0;
  const invalid = FIELDS.some((field) => parsed[field.key] === undefined) || waterInvalid;
  const values: MacroTargets = {
    kcal: parsed.kcal ?? null,
    protein_g: parsed.protein_g ?? null,
    carbs_g: parsed.carbs_g ?? null,
    fat_g: parsed.fat_g ?? null,
  };
  const nameOk = nameText.trim().length > 0;
  const waterValue = parsedWater ?? null;
  const changed =
    nameText.trim() !== name ||
    FIELDS.some((field) => values[field.key] !== saved[field.key]) ||
    waterValue !== water;
  const macroKcal = invalid ? null : macroKcalCheck(values);

  async function save() {
    setSaving(true);
    try {
      await onSave(nameText.trim(), values, waterValue);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TextField
        label="Nome del tipo di giornata"
        testID={`${testID}-nome`}
        value={nameText}
        onChangeText={setNameText}
        invalid={!nameOk}
        variant="section"
        maxLength={30}
      />
      <View style={styles.grid}>
        {FIELDS.map((field) => (
          <View key={field.key} style={styles.cell}>
            <TextField
              label={field.label}
              testID={`${testID}-${field.key}`}
              value={texts[field.key]}
              onChangeText={(text) => setTexts((current) => ({ ...current, [field.key]: text }))}
              keyboardType="decimal-pad"
              invalid={parsed[field.key] === undefined}
              placeholder="–"
            />
          </View>
        ))}
        <View style={styles.cell}>
          <TextField
            label="Acqua (ml)"
            testID={`${testID}-acqua`}
            value={waterText}
            onChangeText={setWaterText}
            keyboardType="decimal-pad"
            invalid={waterInvalid}
            placeholder="–"
          />
        </View>
      </View>
      {invalid ? (
        <TaraText variant="caption" color="error">
          Scrivi solo numeri, con la virgola per i decimali.
        </TaraText>
      ) : macroKcal !== null ? (
        <TaraText variant="caption" color="textSecondary">
          Con questi macro le kcal sono {formatAmount(macroKcal, 'kcal')}, non{' '}
          {formatAmount(values.kcal, 'kcal')}.
        </TaraText>
      ) : null}
      <View style={styles.actions}>
        {canDelete ? (
          <PressableScale
            onPress={onDelete}
            accessibilityLabel={`Elimina ${name}`}
            style={[styles.button, { borderColor: colors.error, borderWidth: 1 }]}
          >
            <TaraText variant="bodyStrong" color="error">
              Elimina
            </TaraText>
          </PressableScale>
        ) : null}
        <PressableScale
          onPress={() => void save()}
          disabled={!changed || invalid || !nameOk || saving}
          accessibilityLabel={`Salva ${nameText.trim() || name}`}
          style={[styles.button, { backgroundColor: colors.action }]}
        >
          <TaraText variant="bodyStrong" color="background">
            Salva
          </TaraText>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.panel,
    borderWidth: 1,
    padding: space.l,
    gap: space.m,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m },
  // Due campi per riga.
  cell: { flexBasis: '45%', flexGrow: 1 },
  actions: { flexDirection: 'row', gap: space.s },
  button: {
    flex: 1,
    minHeight: touch.min,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
