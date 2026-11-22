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
  /** C'è un'aggiunta del giorno da annullare. */
  canUndo: boolean;
  onAdd: (ml: number) => void;
  onUndo: () => void;
}

/**
 * Acqua del giorno (RF-60): litri bevuti contro il target, la barra graduata, un pulsante per
 * ogni incremento e "Annulla" per l'ultima aggiunta. Senza target solo i litri, senza barra.
 */
export function WaterRow({ ml, target, increments, canUndo, onAdd, onUndo }: Props) {
  const { colors } = useTheme();
  const text = waterText(ml, target);
  return (
    <View
      testID="acqua"
      style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.head}>
        <TaraText variant="bodyStrong">Acqua</TaraText>
        <TaraText testID="acqua-totale" variant="bodyStrong" color="textSecondary">
          {text}
        </TaraText>
      </View>
      {target === null ? null : (
        <ProgressTrack fraction={waterFraction(ml, target)} accessibilityLabel={`Acqua ${text}`} />
      )}
      <View style={styles.actions}>
        {increments.map((step) => (
          <PressableScale
            key={step}
            testID={`acqua-${step}`}
            onPress={() => onAdd(step)}
            accessibilityLabel={`Aggiungi ${formatNumber(step, 0)} millilitri d'acqua`}
            style={[styles.button, { backgroundColor: colors.action }]}
          >
            <TaraText variant="bodyStrong" color="background">
              +{formatNumber(step, 0)} ml
            </TaraText>
          </PressableScale>
        ))}
        {canUndo ? (
          <PressableScale
            testID="acqua-annulla"
            onPress={onUndo}
            accessibilityLabel="Annulla l'ultima aggiunta d'acqua"
            style={[styles.button, { borderColor: colors.borderStrong, borderWidth: 1 }]}
          >
            <TaraText variant="bodyStrong">Annulla</TaraText>
          </PressableScale>
        ) : null}
      </View>
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
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  button: {
    minHeight: touch.min,
    minWidth: touch.min,
    paddingHorizontal: space.l,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
