import { StyleSheet, View } from 'react-native';

import type { FoodState } from '@/domain/food';
import { formatAmount } from '@/domain/format';
import { columns, radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

interface Props {
  name: string;
  state: FoodState;
  kcalPer100: number | null;
  proteinPer100: number | null;
  onPress: () => void;
}

/** Risultato di ricerca: nome, "cotto" se serve (il crudo è il predefinito), kcal e proteine per 100 g. */
export function ResultRow({ name, state, kcalPer100, proteinPer100, onPress }: Props) {
  const { colors } = useTheme();
  const kcal = formatAmount(kcalPer100, 'kcal');
  const protein = formatAmount(proteinPer100, 'macro');
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${name}${state === 'cooked' ? ', cotto' : ''}, ${kcal} kcal e ${protein} grammi di proteine per 100 grammi`}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <View style={styles.name}>
        <TaraText numberOfLines={1} style={styles.shrink}>
          {name}
        </TaraText>
        {state === 'cooked' ? (
          <View style={[styles.tag, { borderColor: colors.borderStrong }]}>
            <TaraText variant="minimum" color="textSecondary">
              cotto
            </TaraText>
          </View>
        ) : null}
      </View>
      <View style={styles.value}>
        <TaraText variant="number">{kcal}</TaraText>
        <TaraText variant="minimum" color="textSecondary">
          kcal
        </TaraText>
      </View>
      <View style={styles.value}>
        <TaraText variant="number" color="protein">
          {protein}
        </TaraText>
        <TaraText variant="minimum" color="textSecondary">
          prot.
        </TaraText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touch.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: columns.gap,
    paddingHorizontal: space.l,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s },
  shrink: { flexShrink: 1 },
  tag: { borderWidth: 1, borderRadius: radius.label, paddingHorizontal: space.xs },
  value: { width: columns.weight, alignItems: 'flex-end' },
});
