import { StyleSheet, View } from 'react-native';

import { labelRows } from '@/domain/label';
import { labelColors } from '@/theme/colors';
import { radius, space } from '@/theme/layout';

import { TaraText } from './TaraText';

interface Props {
  title?: string;
  per100: Readonly<Record<string, number | null | undefined>>;
  /** Quantità a cui riportare i valori; senza, i valori sono per 100 g. */
  grams?: number;
}

/** Etichetta nutrizionale: sempre carta bianca e inchiostro nero, come un foglio vero. */
export function NutritionLabel({ title = 'Valori nutrizionali', per100, grams = 100 }: Props) {
  const rows = labelRows(per100, grams);
  return (
    <View style={styles.label}>
      <View style={styles.header}>
        <TaraText variant="section" color="ink">
          {title}
        </TaraText>
        <TaraText variant="caption" color="secondary">
          per {grams} g
        </TaraText>
      </View>
      <View style={styles.thick} />
      {rows.map((row, index) => (
        <View
          key={row.code}
          style={[styles.row, index === rows.length - 1 ? styles.lastRow : styles.thinRow]}
          accessible
          accessibilityLabel={`${row.label} ${row.value}`}
        >
          <TaraText
            variant={row.sub ? 'body' : 'bodyStrong'}
            color="ink"
            style={row.sub ? styles.sub : null}
          >
            {row.label}
          </TaraText>
          <TaraText variant="number" color="ink">
            {row.value}
          </TaraText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    backgroundColor: labelColors.paper,
    borderRadius: radius.label,
    padding: space.m,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  thick: {
    height: 6,
    backgroundColor: labelColors.ink,
    marginTop: space.s,
    marginBottom: space.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 32,
    borderColor: labelColors.ink,
  },
  thinRow: { borderBottomWidth: 1 },
  lastRow: { borderBottomWidth: 3 },
  sub: { paddingLeft: 14 },
});
