import { StyleSheet, View } from 'react-native';

import { type FoodState, stateLabel } from '@/domain/food';
import { formatAmount } from '@/domain/format';
import { columns, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { PressableScale } from './PressableScale';
import { StateTag } from './StateTag';
import { TaraText } from './TaraText';

interface Props {
  name: string;
  state: FoodState;
  /** Metodo di cottura dei cotti, sotto il nome in secondo piano. */
  cooking?: string | null;
  /** Marca di un prodotto personale (RF-02), sotto il nome prima della cottura. */
  brand?: string | null;
  kcalPer100: number | null;
  proteinPer100: number | null;
  onPress: () => void;
}

/**
 * Risultato di ricerca: nome, "cotto" se serve (il crudo è il predefinito) con la cottura
 * sotto, kcal e proteine per 100 g.
 */
export function ResultRow({
  name,
  state,
  cooking = null,
  brand = null,
  kcalPer100,
  proteinPer100,
  onPress,
}: Props) {
  const { colors } = useTheme();
  const kcal = formatAmount(kcalPer100, 'kcal');
  const protein = formatAmount(proteinPer100, 'macro');
  const label = stateLabel(state, cooking);
  const detail = [brand, cooking].filter((text) => text !== null).join(' · ');
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${name}${brand ? `, ${brand}` : ''}${label ? `, ${label}` : ''}, ${kcal} kcal e ${protein} grammi di proteine per 100 grammi`}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <View style={styles.text}>
        <View style={styles.name}>
          {/* Due righe: molti nomi del catalogo si distinguono solo in fondo. */}
          <TaraText numberOfLines={2} style={styles.shrink}>
            {name}
          </TaraText>
          <StateTag state={state} />
        </View>
        {detail !== '' ? (
          <TaraText variant="minimum" color="textSecondary" numberOfLines={1}>
            {detail}
          </TaraText>
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
  text: { flex: 1 },
  name: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  shrink: { flexShrink: 1 },
  value: { width: columns.weight, alignItems: 'flex-end' },
});
