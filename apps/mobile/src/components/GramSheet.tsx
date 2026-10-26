import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
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
  mealName: string;
  lastGrams?: number;
  onAdd: (grams: number) => void;
  onAddAndContinue: (grams: number) => void;
  onClose: () => void;
  /** Passa alla variante cruda o cotta dello stesso alimento (RF-04). */
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
  onAdd,
  onAddAndContinue,
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

  function add(andContinue: boolean) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (andContinue) {
      onAddAndContinue(net);
      setEntry(startEntry());
    } else {
      onAdd(net);
    }
  }

  return (
    <>
      <Animated.View entering={fadeIn} exiting={fadeOut} style={StyleSheet.absoluteFill}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={onClose}
          accessibilityLabel="Chiudi"
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
          <View style={[styles.meal, { backgroundColor: colors.raised }]}>
            <TaraText variant="bodyStrong">{mealName}</TaraText>
          </View>
          <PressableScale onPress={onClose} accessibilityLabel="Chiudi" style={styles.close}>
            <Icon name="close" color="textSecondary" />
          </PressableScale>
        </View>

        <View style={styles.food}>
          <TaraText variant="title" numberOfLines={2}>
            {food.name}
          </TaraText>
          <TaraText variant="caption" color="textSecondary">
            per 100 g: {formatAmount(food.per100.energy_kcal ?? null, 'kcal')} kcal,{' '}
            {formatAmount(food.per100.protein_g ?? null, 'macro')} g di proteine
          </TaraText>
        </View>

        {food.state !== 'not_applicable' ? (
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
                  onPress={() => onChangeState?.(state)}
                  style={[styles.segment, selected ? { backgroundColor: colors.action } : null]}
                >
                  <TaraText variant="bodyStrong" color={selected ? 'background' : 'textSecondary'}>
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
                Ultima volta a {mealName.toLowerCase()}: {formatAmount(lastGrams, 'grams')} g
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
              <TaraText variant="number">
                {formatAmount(
                  amountFor(food.per100[item.code] ?? null, net),
                  item.kcal ? 'kcal' : 'macro',
                )}
                {item.kcal ? ' kcal' : ' g'}
              </TaraText>
            </View>
          ))}
        </View>

        <Keypad
          tareActive={entry.editing === 'tare'}
          onKey={(key) => setEntry((current) => pressKey(current, key))}
        />

        <View style={styles.actions}>
          <PressableScale
            disabled={!addable}
            onPress={() => add(true)}
            style={[styles.action, { borderColor: colors.borderStrong, borderWidth: 1 }]}
          >
            <TaraText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>
              Aggiungi e continua
            </TaraText>
          </PressableScale>
          <PressableScale
            disabled={!addable}
            onPress={() => add(false)}
            style={[styles.action, { backgroundColor: colors.action }]}
          >
            <TaraText
              variant="bodyStrong"
              color="background"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {addable ? `Aggiungi ${netText} g` : 'Aggiungi'}
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
  food: { gap: space.xs },
  segmented: { flexDirection: 'row', borderRadius: radius.key, padding: space.xs, gap: space.xs },
  segment: {
    flex: 1,
    minHeight: 36,
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
    minHeight: 32,
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: space.m,
  },
  preview: { flexDirection: 'row', gap: space.s },
  previewCell: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', gap: space.s },
  action: {
    flex: 1,
    paddingHorizontal: space.s,
    height: touch.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
