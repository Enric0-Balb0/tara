import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SavedMealItem } from '@/data/savedMealsStore';
import { formatAmount } from '@/domain/format';
import { radius, space, touch } from '@/theme/layout';
import { curves, durations } from '@/theme/motion';
import { useTheme } from '@/theme/useTheme';

import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { StateTag } from './StateTag';
import { TaraText } from './TaraText';

interface Props {
  name: string;
  /** Nome del pasto di Oggi a cui si registra, es. "Pranzo". */
  mealName: string;
  items: readonly SavedMealItem[];
  /** Grammi cambiati a mano, per id della voce; le altre restano come nel pasto salvato. */
  quantities: Readonly<Record<string, number>>;
  busy?: boolean;
  onEditItem: (item: SavedMealItem) => void;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Registrare un pasto salvato con un tocco (RF-31): l'elenco delle voci con i grammi, che si
 * correggono con un tocco, e il pulsante che le scrive nel pasto. Sta dentro un Modal.
 */
export function SavedMealSheet({
  name,
  mealName,
  items,
  quantities,
  busy = false,
  onEditItem,
  onConfirm,
  onClose,
}: Props) {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  // Entra e esce come il foglio dei grammi; con il movimento ridotto solo la dissolvenza.
  const fadeIn = FadeIn.duration(durations.quick);
  const fadeOut = FadeOut.duration(durations.quick);
  const sheetIn = reduceMotion
    ? fadeIn
    : SlideInDown.duration(durations.sheetIn).easing(Easing.bezier(...curves.standard));
  const sheetOut = reduceMotion
    ? fadeOut
    : SlideOutDown.duration(durations.sheetOut).easing(Easing.bezier(...curves.exit));
  return (
    <>
      <Animated.View entering={fadeIn} exiting={fadeOut} style={StyleSheet.absoluteFill}>
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
        <TaraText variant="section" accessibilityRole="header" numberOfLines={2}>
          Registra «{name}»
        </TaraText>
        <ScrollView style={styles.list}>
          {items.length === 0 ? (
            <TaraText color="textSecondary">Il pasto salvato non ha più alimenti.</TaraText>
          ) : null}
          {items.map((item) => {
            const quantity = quantities[item.id] ?? item.quantity;
            const unitWord = item.unit === 'ml' ? 'millilitri' : 'grammi';
            return (
              <PressableScale
                key={item.id}
                onPress={() => onEditItem(item)}
                accessibilityLabel={`${item.foodName}, ${formatAmount(quantity, 'grams')} ${unitWord}. Modifica`}
                style={[styles.item, { borderBottomColor: colors.border }]}
              >
                <View style={styles.itemName}>
                  <TaraText numberOfLines={2} style={styles.itemText}>
                    {item.foodName}
                  </TaraText>
                  <StateTag state={item.foodState} />
                </View>
                <TaraText variant="bodyStrong">
                  {formatAmount(quantity, 'grams')} {item.unit}
                </TaraText>
              </PressableScale>
            );
          })}
        </ScrollView>
        <Button
          label={`Registra a ${mealName}`}
          onPress={onConfirm}
          disabled={items.length === 0}
          loading={busy}
          testID="registra-pasto-salvato"
        />
        <Button label="Chiudi" kind="quiet" onPress={onClose} />
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
    maxHeight: '85%',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingTop: space.s,
    gap: space.m,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2 },
  list: { flexGrow: 0 },
  item: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s },
  itemText: { flexShrink: 1 },
});
