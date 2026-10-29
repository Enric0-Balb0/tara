import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FoodState } from '@/domain/food';
import { formatAmount } from '@/domain/format';
import {
  canAdd,
  type GramEntry,
  netGrams,
  pressKey,
  startEntry,
  tareExceedsWeight,
} from '@/domain/gramEntry';
import { amountFor } from '@/domain/label';
import type { ColorToken } from '@/theme/colors';
import { radius, space, touch } from '@/theme/layout';
import { curves, durations } from '@/theme/motion';
import { useTheme } from '@/theme/useTheme';

import { Icon } from './Icon';
import { Keypad } from './Keypad';
import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

export interface SheetFood {
  name: string;
  state: FoodState;
  per100: Readonly<Record<string, number | null | undefined>>;
}

interface Props {
  visible: boolean;
  food: SheetFood;
  /** Pasto a cui va la voce; senza, il foglio calcola soltanto (in F0 il diario non c'è). */
  mealName?: string;
  lastGrams?: number;
  /** Verbo del pulsante principale: "Aggiungi" nel diario, "Usa" quando si calcola. */
  confirmVerb?: string;
  onConfirm: (grams: number) => void;
  /** Senza, il pulsante "Aggiungi e continua" non c'è. */
  onConfirmAndContinue?: (grams: number) => void;
  onClose: () => void;
  /** Passa alla variante cruda o cotta dello stesso alimento (RF-04); senza, il selettore non c'è. */
  onChangeState?: (state: 'raw' | 'cooked') => void;
}

const PREVIEW: readonly { code: string; label: string; color: ColorToken; kcal?: boolean }[] = [
  { code: 'protein_g', label: 'Proteine', color: 'protein' },
  { code: 'carbs_g', label: 'Carboidrati', color: 'carbs' },
  { code: 'fat_g', label: 'Grassi', color: 'fat' },
  { code: 'energy_kcal', label: 'Energia', color: 'text', kcal: true },
];

/**
 * Foglio dei grammi: lettura del netto, tara, macro per la quantità e tastierino (RF-41, RF-42).
 * Va messo come ultimo figlio della schermata: si apre sopra di lei e il tasto indietro lo chiude.
 */
export function GramSheet(props: Props) {
  const { visible, onClose } = props;

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  // Il foglio esiste solo da aperto: ogni apertura riparte dall'ultima quantità usata, e
  // l'animazione di uscita la fa Reanimated quando il foglio si smonta.
  return visible ? <OpenSheet {...props} /> : null;
}

function OpenSheet({
  food,
  mealName,
  lastGrams,
  confirmVerb = 'Aggiungi',
  onConfirm,
  onConfirmAndContinue,
  onClose,
  onChangeState,
}: Props) {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [entry, setEntry] = useState<GramEntry>(() => startEntry(lastGrams));

  const fadeIn = FadeIn.duration(durations.quick);
  const fadeOut = FadeOut.duration(durations.quick);
  const sheetIn = reduceMotion
    ? fadeIn
    : SlideInDown.duration(durations.sheetIn).easing(Easing.bezier(...curves.standard));
  const sheetOut = reduceMotion
    ? fadeOut
    : SlideOutDown.duration(durations.sheetOut).easing(Easing.bezier(...curves.exit));

  const net = netGrams(entry);
  const tooMuchTare = tareExceedsWeight(entry);
  const addable = canAdd(entry);
  const netText = formatAmount(net, 'grams');

  function confirm(andContinue: boolean) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (andContinue && onConfirmAndContinue) {
      onConfirmAndContinue(net);
      setEntry(startEntry());
    } else {
      onConfirm(net);
    }
  }

  return (
    <>
      <Animated.View entering={fadeIn} exiting={fadeOut} style={StyleSheet.absoluteFill}>
        {/* Lo sfondo chiude al tocco ma non è un controllo per il lettore dello schermo: c'è
            già il pulsante "Chiudi", e due controlli con lo stesso nome confonderebbero. */}
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />
      </Animated.View>
      <Animated.View
        entering={sheetIn}
        exiting={sheetOut}
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            paddingBottom: space.l + insets.bottom,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
        <View style={styles.headerRow}>
          {mealName ? (
            <View style={[styles.meal, { backgroundColor: colors.raised }]}>
              <TaraText variant="bodyStrong">{mealName}</TaraText>
            </View>
          ) : (
            <View />
          )}
          <PressableScale onPress={onClose} accessibilityLabel="Chiudi" style={styles.close}>
            <Icon name="close" color="textSecondary" />
          </PressableScale>
        </View>

        <ScrollView
          style={styles.middle}
          contentContainerStyle={styles.middleContent}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.food}>
            <TaraText variant="title" numberOfLines={2}>
              {food.name}
            </TaraText>
            <TaraText variant="caption" color="textSecondary">
              per 100 g: {formatAmount(food.per100.energy_kcal ?? null, 'kcal')} kcal,{' '}
              {formatAmount(food.per100.protein_g ?? null, 'macro')} g di proteine
            </TaraText>
          </View>

          {food.state !== 'not_applicable' && onChangeState ? (
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Stato"
              style={[styles.segmented, { backgroundColor: colors.background }]}
            >
              {(['raw', 'cooked'] as const).map((state) => {
                const selected = food.state === state;
                return (
                  <PressableScale
                    key={state}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => onChangeState(state)}
                    style={[styles.segment, selected ? { backgroundColor: colors.action } : null]}
                  >
                    <TaraText
                      variant="bodyStrong"
                      color={selected ? 'background' : 'textSecondary'}
                    >
                      {state === 'raw' ? 'Crudo' : 'Cotto'}
                    </TaraText>
                  </PressableScale>
                );
              })}
            </View>
          ) : null}

          <View
            style={[
              styles.readoutPanel,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <View style={styles.readoutTop}>
              <TaraText variant="minimum" color="textSecondary">
                Netto
              </TaraText>
              {entry.tare !== '' || entry.editing === 'tare' ? (
                <TaraText
                  variant="minimum"
                  color={entry.editing === 'tare' ? 'text' : 'textSecondary'}
                >
                  tara {formatAmount(Number(entry.tare || '0'), 'grams')} g
                </TaraText>
              ) : null}
            </View>
            <View style={styles.readoutRow}>
              <TaraText
                variant="readout"
                color={addable ? 'text' : 'textSecondary'}
                accessibilityLabel={`${netText} grammi`}
                accessibilityLiveRegion="polite"
                adjustsFontSizeToFit
                numberOfLines={1}
                maxFontSizeMultiplier={1}
                style={styles.readout}
              >
                {netText}
              </TaraText>
              <TaraText variant="section" color="textSecondary">
                g
              </TaraText>
            </View>
            {tooMuchTare ? (
              <View style={styles.error}>
                <Icon name="alert" color="error" size={18} />
                <TaraText variant="caption" color="error">
                  La tara supera il peso
                </TaraText>
              </View>
            ) : lastGrams !== undefined ? (
              <PressableScale
                onPress={() => setEntry(startEntry(lastGrams))}
                style={[styles.lastUsed, { borderColor: colors.borderStrong }]}
              >
                <TaraText variant="caption">
                  {mealName
                    ? `Ultima volta a ${mealName.toLowerCase()}: ${formatAmount(lastGrams, 'grams')} g`
                    : `Ultima quantità: ${formatAmount(lastGrams, 'grams')} g`}
                </TaraText>
              </PressableScale>
            ) : null}
          </View>

          <View style={styles.preview}>
            {PREVIEW.map((item) => (
              <View key={item.code} style={styles.previewCell}>
                <TaraText variant="minimum" color={item.color}>
                  {item.label}
                </TaraText>
                <TaraText variant="number" numberOfLines={1} adjustsFontSizeToFit>
                  {formatAmount(
                    amountFor(food.per100[item.code] ?? null, net),
                    item.kcal ? 'kcal' : 'macro',
                  )}
                  {item.kcal ? ' kcal' : ' g'}
                </TaraText>
              </View>
            ))}
          </View>
        </ScrollView>

        <Keypad
          tareActive={entry.editing === 'tare'}
          onKey={(key) => setEntry((current) => pressKey(current, key))}
        />

        <View style={styles.actions}>
          {onConfirmAndContinue ? (
            <PressableScale
              disabled={!addable}
              onPress={() => confirm(true)}
              style={[styles.action, { borderColor: colors.borderStrong, borderWidth: 1 }]}
            >
              <TaraText
                variant="bodyStrong"
                numberOfLines={1}
                adjustsFontSizeToFit
                style={styles.actionLabel}
              >
                {confirmVerb} e continua
              </TaraText>
            </PressableScale>
          ) : null}
          <PressableScale
            disabled={!addable}
            onPress={() => confirm(false)}
            style={[styles.action, { backgroundColor: colors.action }]}
          >
            <TaraText
              variant="bodyStrong"
              color="background"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.actionLabel}
            >
              {addable ? `${confirmVerb} ${netText} g` : confirmVerb}
            </TaraText>
          </PressableScale>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'black', opacity: 0.6 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Mai più alto dello spazio della schermata: in caso scorre la parte centrale.
    maxHeight: '100%',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    paddingHorizontal: space.l,
    paddingTop: space.s,
    gap: space.m,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meal: { borderRadius: radius.field, paddingHorizontal: space.m, paddingVertical: space.xs },
  close: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flexShrink: 1 },
  middleContent: { gap: space.m },
  readout: { flexShrink: 1 },
  food: { gap: space.xs },
  segmented: { flexDirection: 'row', borderRadius: radius.key, padding: space.xs, gap: space.xs },
  segment: {
    flex: 1,
    minHeight: touch.min,
    borderRadius: radius.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readoutPanel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    gap: space.xs,
  },
  readoutTop: { flexDirection: 'row', justifyContent: 'space-between' },
  readoutRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: space.s,
  },
  error: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 32 },
  lastUsed: {
    alignSelf: 'flex-start',
    minHeight: touch.min,
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: space.m,
  },
  preview: { flexDirection: 'row', gap: space.s },
  previewCell: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', gap: space.s },
  // Larghezza vincolata, così il testo si rimpicciolisce invece di perdere la fine.
  actionLabel: { alignSelf: 'stretch', textAlign: 'center' },
  action: {
    flex: 1,
    paddingHorizontal: space.s,
    height: touch.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
