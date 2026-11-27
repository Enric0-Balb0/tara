import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { formatTotal, type Total } from '@/domain/diary';
import { columns, radius, space, touch } from '@/theme/layout';
import { curves, durations } from '@/theme/motion';
import { useTheme } from '@/theme/useTheme';

import { Icon } from './Icon';
import { type PlannedItem, PlannedLine, PlannedRow } from './PlannedRow';
import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

// Azioni secondarie del pasto: icona piccola accanto al testo normale, tocco sempre da 44.
const ACTION_ICON = 18;

interface Props {
  name: string;
  kcal: Total;
  protein: Total;
  /** Le voci registrate del pasto con la loro chiave (l'id della voce). */
  entries: readonly { key: string; row: ReactNode }[];
  /** Le voci previste dal piano non ancora confermate (RF-130). */
  planned?: readonly PlannedItem[];
  /** "2 di 3": le voci del piano confermate; null senza piano per il pasto. */
  progress?: string | null;
  /** Conferma tutte le voci previste del pasto con i grammi del piano. */
  onConfirmAll?: () => void;
  /** Pasto completo come da piano: si mostra in una riga, che si riapre con un tocco. */
  collapsed?: boolean;
  onToggle?: () => void;
  /** Senza, niente "Aggiungi": un pasto archiviato si modifica ma non si riempie (RF-40). */
  onAdd?: () => void;
  /** Etichetta per il lettore dello schermo; di base "Aggiungi a Pranzo". */
  addLabel?: string;
  /** Copia il pasto da un altro giorno (RF-44), es. "Copia da ieri"; senza, niente pulsante. */
  copy?: { label: string; onPress: () => void };
  /** Salva le voci del pasto come pasto salvato (RF-30); senza, niente pulsante. */
  onSave?: () => void;
}

/**
 * Un pasto (docs/design.md, "Intestazione del pasto"): nome e avanzamento sul piano con la
 * legenda delle colonne a destra, le voci in griglia con separatori sottili, le voci previste
 * tratteggiate e in fondo "Aggiungi" con i totali del pasto nelle colonne di kcal e proteine.
 * Un pasto vuoto sta in una riga; uno tutto da piano in un contenitore tratteggiato con
 * "Registra come da piano"; uno completo come da piano si chiude in una riga.
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
  onSave,
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
          <Icon name="check" color="text" size={20} />
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

  const title = (
    <TaraText variant="section" accessibilityRole="header" numberOfLines={1} style={styles.name}>
      {name}
      {progress ? (
        <TaraText variant="caption" color="textSecondary">
          {' '}
          {progress}
        </TaraText>
      ) : null}
    </TaraText>
  );
  const addButton = onAdd ? (
    <PressableScale
      onPress={onAdd}
      accessibilityLabel={addLabel ?? `Aggiungi a ${name}`}
      style={styles.action}
    >
      <Icon name="plus" color="textSecondary" size={ACTION_ICON} />
      <TaraText color="textSecondary">Aggiungi</TaraText>
    </PressableScale>
  ) : null;
  const copyButton = copy ? (
    <PressableScale
      onPress={copy.onPress}
      accessibilityLabel={`${copy.label}: ${name}`}
      style={styles.action}
    >
      <TaraText color="textSecondary">{copy.label}</TaraText>
    </PressableScale>
  ) : null;

  // Un pasto senza voci né previste: nome e azioni nella stessa riga.
  if (entries.length === 0 && planned.length === 0) {
    return (
      <Animated.View layout={layout} style={styles.emptyRow}>
        {title}
        <View style={styles.emptyActions}>
          {copyButton}
          {addButton}
        </View>
      </Animated.View>
    );
  }

  const allPlanned = entries.length === 0 && planned.length > 1 && onConfirmAll !== undefined;
  const legend =
    entries.length > 0 || allPlanned ? (
      <View
        style={styles.legend}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <TaraText variant="minimum" color="textSecondary" style={styles.weight}>
          peso
        </TaraText>
        <TaraText variant="minimum" color="textSecondary" style={styles.kcal}>
          kcal
        </TaraText>
        <TaraText variant="minimum" color="textSecondary" style={styles.protein}>
          prot.
        </TaraText>
      </View>
    ) : null;
  const confirmAll =
    planned.length > 1 && onConfirmAll ? (
      <PressableScale
        onPress={onConfirmAll}
        accessibilityLabel={`Registra ${name} come da piano`}
        style={[styles.confirmAll, { backgroundColor: colors.raised }]}
      >
        <TaraText variant="bodyStrong">Registra come da piano</TaraText>
      </PressableScale>
    ) : null;
  const kcalText = formatTotal(kcal, 'kcal');
  const proteinText = formatTotal(protein, 'macro');

  return (
    <Animated.View layout={layout}>
      {/* Si tocca solo un pasto completo, per richiuderlo; altrimenti è un'intestazione. */}
      {onToggle ? (
        <PressableScale
          onPress={onToggle}
          accessibilityHint="Chiude il pasto in una riga"
          style={styles.header}
        >
          {title}
          {legend}
        </PressableScale>
      ) : (
        <View style={styles.header}>
          {title}
          {legend}
        </View>
      )}

      {entries.map(({ key, row }) => (
        <Animated.View
          key={key}
          entering={FadeIn.duration(durations.entry)}
          exiting={FadeOut.duration(durations.quick)}
          layout={layout}
          style={[styles.divider, { borderColor: colors.border }]}
        >
          {row}
        </Animated.View>
      ))}

      {allPlanned ? (
        <View style={[styles.plannedBox, { borderColor: colors.borderStrong }]}>
          {planned.map((item) => (
            <Animated.View
              key={item.key}
              entering={FadeIn.duration(durations.entry)}
              exiting={FadeOut.duration(durations.quick)}
              layout={layout}
              style={styles.plannedLine}
            >
              <PlannedLine item={item} />
            </Animated.View>
          ))}
          {confirmAll}
        </View>
      ) : (
        <>
          {planned.map((item) => (
            <Animated.View
              key={item.key}
              entering={FadeIn.duration(durations.entry)}
              exiting={FadeOut.duration(durations.quick)}
              layout={layout}
              style={styles.planned}
            >
              <PlannedRow item={item} />
            </Animated.View>
          ))}
          {confirmAll}
        </>
      )}

      <View style={styles.footer}>
        <View style={styles.footerActions}>
          {addButton}
          {copyButton}
          {onSave ? (
            <PressableScale
              onPress={onSave}
              accessibilityLabel={`Salva come pasto: ${name}`}
              testID={`salva-pasto-${name.toLowerCase()}`}
              style={styles.action}
            >
              <TaraText color="textSecondary">Salva come pasto</TaraText>
            </PressableScale>
          ) : null}
        </View>
        {entries.length > 0 ? (
          <View
            accessible
            accessibilityLabel={`Totale ${name}: ${kcalText} kcal, ${proteinText} grammi di proteine`}
            style={styles.totals}
          >
            <TaraText numberOfLines={1} style={styles.kcal}>
              {kcalText}
            </TaraText>
            <TaraText numberOfLines={1} style={styles.protein}>
              {proteinText}
            </TaraText>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: columns.gap,
    paddingHorizontal: space.m,
    paddingBottom: space.xs,
  },
  name: { flex: 1, minWidth: 0 },
  legend: { flexDirection: 'row', gap: columns.gap },
  weight: { width: columns.weight, textAlign: 'right' },
  kcal: { width: columns.kcal, textAlign: 'right' },
  protein: { width: columns.protein, textAlign: 'right' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  planned: { marginTop: space.s },
  // Il bordo tratteggiato è largo 1: le righe dentro rientrano di 1 per restare in colonna.
  plannedBox: {
    marginTop: space.s,
    borderRadius: radius.key,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingBottom: space.s,
  },
  plannedLine: { marginHorizontal: -1 },
  confirmAll: {
    minHeight: touch.min,
    marginTop: space.s,
    marginHorizontal: space.s,
    borderRadius: radius.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Con le azioni su due righe i totali restano sulla prima, accanto ad "Aggiungi".
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: columns.gap,
    paddingRight: space.m,
    marginTop: space.xs,
  },
  footerActions: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  totals: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: columns.gap },
  action: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.m,
  },
  // Un pasto vuoto è una riga sola: il nome si accorcia, le azioni restano intere.
  emptyRow: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.m,
  },
  emptyActions: { flexShrink: 0, flexDirection: 'row', alignItems: 'center' },
  collapsed: {
    minHeight: touch.min + space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: space.m,
    borderRadius: radius.key,
    borderWidth: 1,
  },
});
