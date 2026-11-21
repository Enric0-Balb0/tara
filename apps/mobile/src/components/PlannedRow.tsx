import { StyleSheet, View } from 'react-native';

import { formatAmount } from '@/domain/format';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

interface Props {
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

/**
 * Voce prevista dal piano (docs/design.md, "Voce di diario"): bordo tratteggiato, testo
 * attenuato e "Conferma". Un tocco sulla riga permette di cambiare i grammi prima.
 */
export function PlannedRow({ name, quantity, unit, kcal, protein, onConfirm, onEdit }: Props) {
  const { colors } = useTheme();
  const amount = formatAmount(quantity, 'grams');
  const kcalText = formatAmount(kcal, 'kcal');
  const proteinText = formatAmount(protein, 'macro');
  return (
    <View style={[styles.row, { borderColor: colors.borderStrong }]}>
      <PressableScale
        onPress={onEdit}
        accessibilityLabel={`${name}, previsto ${amount} ${unit === 'g' ? 'grammi' : 'millilitri'}, ${kcalText} kcal, ${proteinText} grammi di proteine`}
        accessibilityHint="Cambia i grammi prima di confermare"
        style={styles.text}
      >
        <TaraText numberOfLines={1}>{name}</TaraText>
        <TaraText variant="caption" color="textSecondary" numberOfLines={1}>
          previsto {amount} {unit}, {kcalText} kcal, {proteinText} prot.
        </TaraText>
      </PressableScale>
      <PressableScale
        onPress={onConfirm}
        accessibilityLabel={`Conferma ${name}`}
        style={[styles.confirm, { borderColor: colors.text }]}
      >
        <TaraText variant="bodyStrong">Conferma</TaraText>
      </PressableScale>
    </View>
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
    borderRadius: radius.field,
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
});
