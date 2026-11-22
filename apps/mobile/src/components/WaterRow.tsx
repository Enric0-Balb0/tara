import { StyleSheet, View } from 'react-native';

import { formatNumber } from '@/domain/format';
import { waterFraction, waterText } from '@/domain/water';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { PressableScale } from './PressableScale';
import { ProgressTrack } from './ProgressTrack';
import { TaraText } from './TaraText';

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
 * Acqua del giorno (RF-60) in una riga sola: a sinistra "Acqua", i litri contro il target e un
 * sottile avanzamento (solo con un target); a destra un pulsante a pillola per ogni incremento e
 * "Annulla +500", che dice cosa toglie. I pulsanti vanno a capo solo se la riga non basta.
 */
export function WaterRow({ ml, target, increments, lastAdded, onAdd, onUndo }: Props) {
  const { colors } = useTheme();
  const text = waterText(ml, target);
  return (
    <View
      testID="acqua"
      style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.summary}>
        <View style={styles.head}>
          <TaraText variant="bodyStrong">Acqua</TaraText>
          <TaraText testID="acqua-totale" variant="caption" color="textSecondary">
            {text}
          </TaraText>
        </View>
        {target === null ? null : (
          <ProgressTrack
            fraction={waterFraction(ml, target)}
            accessibilityLabel={`Acqua ${text}`}
          />
        )}
      </View>
      <View style={styles.actions}>
        {increments.map((step) => (
          <PressableScale
            key={step}
            testID={`acqua-${step}`}
            onPress={() => onAdd(step)}
            accessibilityLabel={`Aggiungi ${formatNumber(step, 0)} millilitri d'acqua`}
            style={[styles.pill, { backgroundColor: colors.action }]}
          >
            <TaraText variant="bodyStrong" color="background">
              +{formatNumber(step, 0)}
            </TaraText>
          </PressableScale>
        ))}
        {lastAdded === null ? null : (
          <PressableScale
            testID="acqua-annulla"
            onPress={onUndo}
            accessibilityLabel={`Annulla l'ultima aggiunta di ${formatNumber(lastAdded, 0)} millilitri`}
            style={[styles.pill, { borderColor: colors.borderStrong, borderWidth: 1 }]}
          >
            <TaraText variant="bodyStrong">Annulla +{formatNumber(lastAdded, 0)}</TaraText>
          </PressableScale>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.panel,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    columnGap: space.m,
    rowGap: space.xs,
  },
  summary: { flexGrow: 1, flexShrink: 1, minWidth: 112, gap: space.xs },
  head: { gap: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  pill: {
    minHeight: touch.min,
    minWidth: touch.min,
    paddingHorizontal: space.m,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
