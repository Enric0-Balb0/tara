import { StyleSheet, View } from 'react-native';

import type { FoodState } from '@/domain/food';
import { formatAmount } from '@/domain/format';
import { columns, space, touch } from '@/theme/layout';

import { PressableScale } from './PressableScale';
import { StateTag } from './StateTag';
import { TaraText } from './TaraText';
import { useEntryColumns } from './useEntryColumns';

interface Props {
  name: string;
  state: FoodState;
  quantity: number;
  unit: 'g' | 'ml';
  kcal: number | null;
  protein: number | null;
  onPress: () => void;
}

/**
 * Voce di diario registrata (docs/design.md, "Componenti"): nome, peso, kcal e proteine
 * nelle colonne fisse, le stesse dell'intestazione del pasto. Un tocco la modifica.
 */
export function DiaryRow({ name, state, quantity, unit, kcal, protein, onPress }: Props) {
  const entry = useEntryColumns();
  const amount = formatAmount(quantity, 'grams');
  const weight = `${amount} ${unit}`;
  const kcalText = formatAmount(kcal, 'kcal');
  const proteinText = formatAmount(protein, 'macro');
  const spoken = [
    `${name}${state === 'cooked' ? ', cotto' : ''}`,
    `${amount} ${unit === 'g' ? 'grammi' : 'millilitri'}`,
    `${kcalText} kcal`,
    `${proteinText} grammi di proteine`,
  ].join(', ');
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={spoken}
      accessibilityHint="Modifica o elimina la voce"
      style={styles.row}
    >
      <View style={styles.name}>
        <TaraText numberOfLines={1} style={styles.nameText}>
          {name}
        </TaraText>
        <StateTag state={state} />
      </View>
      <TaraText variant="number" numberOfLines={1} style={[styles.number, { width: entry.weight }]}>
        {weight}
      </TaraText>
      <TaraText
        color="textSecondary"
        numberOfLines={1}
        style={[styles.number, { width: entry.kcal }]}
      >
        {kcalText}
      </TaraText>
      <TaraText
        color="textSecondary"
        numberOfLines={1}
        style={[styles.number, { width: entry.protein }]}
      >
        {proteinText}
      </TaraText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: columns.gap,
    paddingHorizontal: space.m,
  },
  name: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s, minWidth: 0 },
  nameText: { flexShrink: 1 },
  // Larghezze da useEntryColumns: crescono con il testo, la stessa fonte per righe e legenda.
  number: { textAlign: 'right' },
});
