import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { formatTotal, type Total } from '@/domain/diary';
import { columns, radius, space, touch } from '@/theme/layout';
import { curves, durations } from '@/theme/motion';
import { useTheme } from '@/theme/useTheme';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

interface Props {
  name: string;
  kcal: Total;
  protein: Total;
  /** Le voci del pasto con la loro chiave (l'id della voce); vuoto se non c'è niente. */
  entries: readonly { key: string; row: ReactNode }[];
  onAdd: () => void;
}

/**
 * Un pasto del diario (docs/design.md, "Intestazione del pasto"): nome e totali nelle stesse
 * colonne delle voci, le voci, e "Aggiungi" per cercare un alimento da mettere qui.
 */
export function MealSection({ name, kcal, protein, entries, onAdd }: Props) {
  const { colors, reduceMotion } = useTheme();
  const empty = entries.length === 0;
  // "voce": la riga nuova compare e le altre si spostano; con il movimento ridotto solo
  // la dissolvenza.
  const layout = reduceMotion
    ? undefined
    : LinearTransition.duration(durations.entry).easing(Easing.bezier(...curves.standard));
  return (
    <Animated.View layout={layout} style={styles.section}>
      <View style={styles.header}>
        <TaraText variant="section" numberOfLines={1} accessibilityRole="header" style={styles.name}>
          {name}
        </TaraText>
        {empty ? null : (
          <>
            <View style={styles.weight} />
            <TaraText
              variant="number"
              numberOfLines={1}
              accessibilityLabel={`${formatTotal(kcal, 'kcal')} kcal`}
              style={styles.kcal}
            >
              {formatTotal(kcal, 'kcal')}
            </TaraText>
            <TaraText
              variant="number"
              numberOfLines={1}
              accessibilityLabel={`${formatTotal(protein, 'macro')} grammi di proteine`}
              style={styles.protein}
            >
              {formatTotal(protein, 'macro')}
            </TaraText>
          </>
        )}
      </View>
      {empty ? null : (
        <View style={[styles.rows, { borderColor: colors.border }]}>
          {entries.map(({ key, row }, index) => (
            <Animated.View
              key={key}
              entering={FadeIn.duration(durations.entry)}
              exiting={FadeOut.duration(durations.quick)}
              layout={layout}
              style={index > 0 ? [styles.divider, { borderColor: colors.border }] : undefined}
            >
              {row}
            </Animated.View>
          ))}
        </View>
      )}
      <PressableScale
        onPress={onAdd}
        accessibilityLabel={`Aggiungi a ${name}`}
        style={styles.add}
      >
        <Icon name="plus" color="textSecondary" size={18} />
        <TaraText variant="bodyStrong" color="textSecondary">
          Aggiungi
        </TaraText>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.xs },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: columns.gap,
    paddingHorizontal: space.m,
    minHeight: 32,
  },
  name: { flex: 1 },
  weight: { width: columns.weight },
  kcal: { width: columns.kcal, textAlign: 'right' },
  protein: { width: columns.protein, textAlign: 'right' },
  rows: { borderRadius: radius.field, borderWidth: 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  add: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.m,
    alignSelf: 'flex-start',
  },
});
