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
  /** Le voci registrate del pasto con la loro chiave (l'id della voce). */
  entries: readonly { key: string; row: ReactNode }[];
  /** Le voci previste dal piano non ancora confermate (RF-130). */
  planned?: readonly { key: string; row: ReactNode }[];
  /** "2 di 3": le voci del piano confermate; null senza piano per il pasto. */
  progress?: string | null;
  /** Conferma tutte le voci previste del pasto con i grammi del piano. */
  onConfirmAll?: () => void;
  /** Pasto completo come da piano: si mostra in una riga, che si riapre con un tocco. */
  collapsed?: boolean;
  onToggle?: () => void;
  onAdd: () => void;
  /** Etichetta per il lettore dello schermo; di base "Aggiungi a Pranzo". */
  addLabel?: string;
  /** Copia il pasto da un altro giorno (RF-44), es. "Copia da ieri"; senza, niente pulsante. */
  copy?: { label: string; onPress: () => void };
}

/**
 * Un pasto (docs/design.md, "Intestazione del pasto"): nome, avanzamento sul piano e totali
 * nelle stesse colonne delle voci; le voci registrate, quelle previste dal piano e
 * "Aggiungi". Un pasto completo come da piano si chiude in una riga.
 */
export function MealSection({
  name,
  kcal,
  protein,
  entries,
  planned = [],
  progress = null,
  onConfirmAll,
  collapsed = false,
  onToggle,
  onAdd,
  addLabel,
  copy,
}: Props) {
  const { colors, reduceMotion } = useTheme();
  // "voce": la riga nuova compare e le altre si spostano; con il movimento ridotto solo
  // la dissolvenza.
  const layout = reduceMotion
    ? undefined
    : LinearTransition.duration(durations.entry).easing(Easing.bezier(...curves.standard));

  if (collapsed) {
    return (
      <Animated.View layout={layout}>
        <PressableScale
          onPress={onToggle}
          accessibilityLabel={`${name}, ${progress ?? ''}, ${formatTotal(kcal, 'kcal')} kcal`}
          accessibilityHint="Mostra le voci del pasto"
          style={[
            styles.collapsed,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Icon name="check" color="text" />
          <TaraText variant="section" numberOfLines={1} style={styles.name}>
            {name}{' '}
            <TaraText variant="caption" color="textSecondary">
              {progress}
            </TaraText>
          </TaraText>
          <TaraText color="textSecondary">
            <TaraText variant="number">{formatTotal(kcal, 'kcal')}</TaraText> kcal
          </TaraText>
        </PressableScale>
      </Animated.View>
    );
  }

  const empty = entries.length === 0;
  const header = (
    <>
      <TaraText variant="section" numberOfLines={1} style={styles.name}>
        {name}
        {progress ? (
          <TaraText variant="caption" color="textSecondary">
            {' '}
            {progress}
          </TaraText>
        ) : null}
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
    </>
  );
  return (
    <Animated.View layout={layout} style={styles.section}>
      {/* Si tocca solo un pasto completo, per richiuderlo; altrimenti è un'intestazione. */}
      {onToggle ? (
        <PressableScale
          onPress={onToggle}
          accessibilityHint="Chiude il pasto in una riga"
          style={styles.header}
        >
          {header}
        </PressableScale>
      ) : (
        <View style={styles.header} accessibilityRole="header">
          {header}
        </View>
      )}
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
      {planned.map(({ key, row }) => (
        <Animated.View
          key={key}
          entering={FadeIn.duration(durations.entry)}
          exiting={FadeOut.duration(durations.quick)}
          layout={layout}
        >
          {row}
        </Animated.View>
      ))}
      {planned.length > 1 && onConfirmAll ? (
        <PressableScale
          onPress={onConfirmAll}
          accessibilityLabel={`Registra ${name} come da piano`}
          style={[styles.confirmAll, { backgroundColor: colors.raised }]}
        >
          <TaraText variant="bodyStrong">Registra come da piano</TaraText>
        </PressableScale>
      ) : null}
      <View style={styles.actions}>
        <PressableScale
          onPress={onAdd}
          accessibilityLabel={addLabel ?? `Aggiungi a ${name}`}
          style={styles.add}
        >
          <Icon name="plus" color="textSecondary" />
          <TaraText variant="bodyStrong" color="textSecondary">
            Aggiungi
          </TaraText>
        </PressableScale>
        {copy ? (
          <PressableScale
            onPress={copy.onPress}
            accessibilityLabel={`${copy.label}: ${name}`}
            style={styles.add}
          >
            <TaraText variant="bodyStrong" color="textSecondary">
              {copy.label}
            </TaraText>
          </PressableScale>
        ) : null}
      </View>
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
    minHeight: space.xxxl,
  },
  name: { flex: 1 },
  weight: { width: columns.weight },
  kcal: { width: columns.kcal, textAlign: 'right' },
  protein: { width: columns.protein, textAlign: 'right' },
  rows: { borderRadius: radius.field, borderWidth: 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  collapsed: {
    minHeight: touch.min + space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: space.m,
    borderRadius: radius.field,
    borderWidth: 1,
  },
  confirmAll: {
    minHeight: touch.min,
    borderRadius: radius.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  add: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.m,
    alignSelf: 'flex-start',
  },
});
