import { StyleSheet, View } from 'react-native';

import { formatNumber } from '@/domain/format';
import { waterFigures, waterText } from '@/domain/water';
import { goals, space, touch } from '@/theme/layout';
import { textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

import { GoalBar } from './GoalBar';
import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

// Pillole basse a vista, ma il tocco resta di 44: il resto lo dà hitSlop.
const PILL_HEIGHT = touch.min - space.s;
const PILL_SLOP = (touch.min - PILL_HEIGHT) / 2;

interface Props {
  /** Gli ml bevuti nel giorno mostrato. */
  ml: number;
  /** Il target dell'acqua del tipo di giornata, in ml; null se non impostato. */
  target: number | null;
  increments: readonly number[];
  /** I ml dell'ultima aggiunta del giorno, che "Annulla" toglie; null se non c'è. */
  lastAdded: number | null;
  onAdd: (ml: number) => void;
  onUndo: () => void;
}

/**
 * Acqua del giorno (RF-60), l'ultima riga della scheda degli obiettivi, come quelle dei macro:
 * "Acqua" nella colonna dei nomi, la barra sottile (solo con un target), una pillola per
 * incremento e "1,25 / 3 l" nella colonna dei valori. Se a 412 dp non ci sta, il valore va a
 * capo a destra. "Annulla +500", che dice cosa toglie, sta nella riga sotto.
 */
export function WaterRow({ ml, target, increments, lastAdded, onAdd, onUndo }: Props) {
  const { colors } = useTheme();
  const figures = waterFigures(ml, target);
  return (
    <View testID="acqua" style={styles.stack}>
      <View style={styles.row}>
        <TaraText variant="bodyStrong" numberOfLines={1} style={styles.label}>
          Acqua
        </TaraText>
        <View style={styles.bar}>
          {target === null ? null : <GoalBar color="text" logged={ml} target={target} />}
        </View>
        <View style={styles.actions}>
          {increments.map((step) => (
            <PressableScale
              key={step}
              testID={`acqua-${step}`}
              onPress={() => onAdd(step)}
              accessibilityLabel={`Aggiungi ${formatNumber(step, 0)} millilitri d'acqua`}
              hitSlop={PILL_SLOP}
              style={[styles.pill, { backgroundColor: colors.raised }]}
            >
              <TaraText variant="caption" style={styles.pillText}>
                +{formatNumber(step, 0)}
              </TaraText>
            </PressableScale>
          ))}
        </View>
        <TaraText
          testID="acqua-totale"
          color="textSecondary"
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityLabel={waterText(ml, target)}
          style={styles.value}
        >
          <TaraText variant="figure">{figures.value}</TaraText>
          {figures.rest}
        </TaraText>
      </View>
      {lastAdded === null ? null : (
        <PressableScale
          testID="acqua-annulla"
          onPress={onUndo}
          accessibilityLabel={`Annulla l'ultima aggiunta di ${formatNumber(lastAdded, 0)} millilitri`}
          hitSlop={PILL_SLOP}
          style={[styles.pill, styles.undo, { borderColor: colors.borderStrong }]}
        >
          <TaraText variant="caption" style={styles.pillText}>
            Annulla +{formatNumber(lastAdded, 0)}
          </TaraText>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.s },
  row: {
    minHeight: touch.min,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: goals.gap,
    rowGap: space.xs,
  },
  label: { width: goals.label },
  bar: { flex: 1, minWidth: space.xxxl },
  actions: { flexDirection: 'row', gap: space.xs },
  // Allineato ai valori dei macro; se la riga non basta va a capo, a destra.
  value: { width: goals.value, marginLeft: 'auto', textAlign: 'right' },
  pill: {
    height: PILL_HEIGHT,
    minWidth: touch.min,
    paddingHorizontal: space.s,
    borderRadius: PILL_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontFamily: textStyles.bodyStrong.fontFamily },
  undo: { alignSelf: 'flex-end', borderWidth: 1 },
});
