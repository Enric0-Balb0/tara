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

import {
  pressWeightKey,
  startWeightInput,
  type WeightInput,
  weightFromInput,
} from '@/domain/weight';
import { radius, space, touch } from '@/theme/layout';
import { curves, durations } from '@/theme/motion';
import { useTheme } from '@/theme/useTheme';

import { Icon } from './Icon';
import { Keypad } from './Keypad';
import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

interface Props {
  visible: boolean;
  /** Il giorno della pesata, come "Peso di oggi" o "domenica 22 novembre". */
  title: string;
  /** Il peso già registrato quel giorno: il foglio parte da lì e compare "Elimina". */
  startKg?: number;
  onConfirm: (kg: number) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** Foglio del peso (RF-70): tastierino con la virgola, un decimale, "Salva 82,4 kg". */
export function WeightSheet(props: Props) {
  const { visible, onClose } = props;

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  return visible ? <OpenSheet {...props} /> : null;
}

function OpenSheet({ title, startKg, onConfirm, onDelete, onClose }: Props) {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState<WeightInput>(() => startWeightInput(startKg));

  const fadeIn = FadeIn.duration(durations.quick);
  const fadeOut = FadeOut.duration(durations.quick);
  const sheetIn = reduceMotion
    ? fadeIn
    : SlideInDown.duration(durations.sheetIn).easing(Easing.bezier(...curves.standard));
  const sheetOut = reduceMotion
    ? fadeOut
    : SlideOutDown.duration(durations.sheetOut).easing(Easing.bezier(...curves.exit));

  const kg = weightFromInput(input);
  // "82," si legge e si salva come 82.
  const shown = input.text.replace(/,$/, '');

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
        <View style={styles.headerRow}>
          <TaraText variant="section" accessibilityRole="header">
            {title}
          </TaraText>
          <PressableScale onPress={onClose} accessibilityLabel="Chiudi" style={styles.close}>
            <Icon name="close" color="textSecondary" />
          </PressableScale>
        </View>

        <View
          style={[
            styles.readoutPanel,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={styles.readoutRow}>
            <TaraText
              variant="readout"
              color={kg === null ? 'textSecondary' : 'text'}
              accessibilityLabel={shown === '' ? 'Nessun peso' : `${shown} chili`}
              accessibilityLiveRegion="polite"
              adjustsFontSizeToFit
              numberOfLines={1}
              maxFontSizeMultiplier={1}
              style={styles.readout}
            >
              {shown === '' ? '0' : input.text}
            </TaraText>
            <TaraText variant="section" color="textSecondary">
              kg
            </TaraText>
          </View>
          <TaraText variant="minimum" color="textSecondary">
            Tra 20 e 400 kg, con un decimale
          </TaraText>
        </View>

        <Keypad decimal onKey={(key) => setInput((current) => pressWeightKey(current, key))} />

        <View style={styles.actions}>
          {onDelete ? (
            <PressableScale
              testID="elimina-peso"
              onPress={onDelete}
              accessibilityLabel="Elimina la pesata"
              style={[styles.action, { borderColor: colors.error, borderWidth: 1 }]}
            >
              <TaraText variant="bodyStrong" color="error" style={styles.actionLabel}>
                Elimina
              </TaraText>
            </PressableScale>
          ) : null}
          <PressableScale
            testID="salva-peso"
            disabled={kg === null}
            onPress={() => {
              if (kg === null) return;
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onConfirm(kg);
            }}
            accessibilityLabel={kg === null ? 'Salva' : `Salva ${shown} chili`}
            style={[styles.action, { backgroundColor: colors.action }]}
          >
            <TaraText
              variant="bodyStrong"
              color="background"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.actionLabel}
            >
              {kg === null ? 'Salva' : `Salva ${shown} kg`}
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
  close: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
  readoutPanel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    gap: space.xs,
  },
  readoutRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: space.s,
  },
  readout: { flexShrink: 1 },
  actions: { flexDirection: 'row', gap: space.s },
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
