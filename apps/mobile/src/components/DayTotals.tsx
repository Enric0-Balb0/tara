import { StyleSheet, View } from 'react-native';

import { type DiaryNutrient, formatTotal, type Total } from '@/domain/diary';
import type { ColorToken } from '@/theme/colors';
import { radius, space } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { TaraText } from './TaraText';

const CELLS: readonly {
  code: DiaryNutrient;
  label: string;
  unit: string;
  spoken: string;
  color: ColorToken;
}[] = [
  { code: 'energy_kcal', label: 'kcal', unit: '', spoken: 'kcal', color: 'text' },
  {
    code: 'protein_g',
    label: 'Proteine',
    unit: ' g',
    spoken: 'grammi di proteine',
    color: 'protein',
  },
  {
    code: 'carbs_g',
    label: 'Carboidrati',
    unit: ' g',
    spoken: 'grammi di carboidrati',
    color: 'carbs',
  },
  { code: 'fat_g', label: 'Grassi', unit: ' g', spoken: 'grammi di grassi', color: 'fat' },
];

/**
 * Riepilogo della giornata (RF-45): kcal e macro registrati. I target per tipo di giornata e
 * le barre graduate arrivano con RF-50; un totale con "≥" ha voci senza quel valore.
 */
export function DayTotals({ totals }: { totals: Record<DiaryNutrient, Total> }) {
  const { colors } = useTheme();
  const incomplete = CELLS.some((cell) => totals[cell.code].incomplete);
  return (
    <View
      accessibilityLabel="Totali della giornata"
      style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.cells}>
        {CELLS.map((cell) => {
          const value = formatTotal(
            totals[cell.code],
            cell.code === 'energy_kcal' ? 'kcal' : 'macro',
          );
          return (
            <View
              key={cell.code}
              accessible
              accessibilityLabel={`${value} ${cell.spoken}`}
              style={styles.cell}
            >
              <TaraText variant="bigNumber" numberOfLines={1} adjustsFontSizeToFit>
                {value}
                <TaraText variant="caption" color="textSecondary">
                  {cell.unit}
                </TaraText>
              </TaraText>
              <TaraText variant="minimum" color={cell.color} numberOfLines={1}>
                {cell.label}
              </TaraText>
            </View>
          );
        })}
      </View>
      {incomplete ? (
        <TaraText variant="caption" color="textSecondary">
          ≥: alcune voci non hanno questo valore, il totale è un minimo.
        </TaraText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    gap: space.s,
  },
  cells: { flexDirection: 'row', gap: space.m },
  cell: { flex: 1, gap: space.xs },
});
