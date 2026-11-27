import { StyleSheet, View } from 'react-native';

import { formatAmount } from '@/domain/format';
import { columns, radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

export interface PlannedItem {
  key: string;
  name: string;
  quantity: number;
  unit: 'g' | 'ml';
  kcal: number | null;
  protein: number | null;
  /** Conferma con i grammi del piano. */
  onConfirm: () => void;
  /** Apre il foglio per cambiare i grammi prima di confermare. */
  onEdit: () => void;
}

function texts({ name, quantity, unit, kcal, protein }: PlannedItem) {
  const amount = formatAmount(quantity, 'grams');
  const kcalText = formatAmount(kcal, 'kcal');
  const proteinText = formatAmount(protein, 'macro');
  return {
    amount,
    kcalText,
    proteinText,
    spoken: `${name}, previsto ${amount} ${unit === 'g' ? 'grammi' : 'millilitri'}, ${kcalText} kcal, ${proteinText} grammi di proteine`,
  };
}

/**
 * Voce prevista dal piano (docs/design.md, "Voce di diario"): bordo tratteggiato, testo
 * attenuato e "Conferma". Un tocco sulla riga permette di cambiare i grammi prima.
 */
export function PlannedRow({ item }: { item: PlannedItem }) {
  const { colors } = useTheme();
  const { amount, kcalText, proteinText, spoken } = texts(item);
  return (
    <View style={[styles.row, { borderColor: colors.borderStrong }]}>
      <PressableScale
        onPress={item.onEdit}
        accessibilityLabel={spoken}
        accessibilityHint="Cambia i grammi prima di confermare"
        style={styles.text}
      >
        <TaraText color="textSecondary" numberOfLines={1}>
          {item.name}
        </TaraText>
        <TaraText variant="caption" color="textSecondary" numberOfLines={1}>
          previsto {amount} {item.unit}, {kcalText} kcal, {proteinText} prot.
        </TaraText>
      </PressableScale>
      <PressableScale
        onPress={item.onConfirm}
        accessibilityLabel={`Conferma ${item.name}`}
        style={[styles.confirm, { borderColor: colors.text }]}
      >
        <TaraText variant="bodyStrong">Conferma</TaraText>
      </PressableScale>
    </View>
  );
}

/**
 * Voce prevista dentro un pasto tutto da piano: la stessa griglia delle voci registrate (nome,
 * peso, kcal, proteine), attenuata, senza "Conferma" (c'è "Registra come da piano" sotto). Un
 * tocco apre il foglio per confermarla da sola, anche con altri grammi.
 */
export function PlannedLine({ item }: { item: PlannedItem }) {
  const { amount, kcalText, proteinText, spoken } = texts(item);
  return (
    <PressableScale
      onPress={item.onEdit}
      accessibilityLabel={spoken}
      accessibilityHint="Conferma la voce, anche con altri grammi"
      style={styles.line}
    >
      <TaraText color="textSecondary" numberOfLines={1} style={styles.name}>
        {item.name}
      </TaraText>
      <TaraText color="textSecondary" numberOfLines={1} style={styles.weight}>
        {`${amount} ${item.unit}`}
      </TaraText>
      <TaraText color="textSecondary" numberOfLines={1} style={styles.kcal}>
        {kcalText}
      </TaraText>
      <TaraText color="textSecondary" numberOfLines={1} style={styles.protein}>
        {proteinText}
      </TaraText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touch.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingLeft: space.m,
    paddingRight: space.xs,
    borderRadius: radius.key,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  text: { flex: 1, minWidth: 0, paddingVertical: space.xs },
  confirm: {
    minHeight: touch.min,
    borderRadius: radius.field,
    borderWidth: 1,
    paddingHorizontal: space.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: columns.gap,
    paddingHorizontal: space.m,
  },
  name: { flex: 1, minWidth: 0 },
  weight: { width: columns.weight, textAlign: 'right' },
  kcal: { width: columns.kcal, textAlign: 'right' },
  protein: { width: columns.protein, textAlign: 'right' },
});
