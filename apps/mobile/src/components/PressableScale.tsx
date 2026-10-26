import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { curves, durations, PRESS_SCALE } from '@/theme/motion';
import { useTheme } from '@/theme/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const timing = { duration: durations.press, easing: Easing.bezier(...curves.standard) };

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** Tasto o riga che si abbassa al tocco; con il movimento ridotto cambia solo l'opacità. */
export function PressableScale({ style, children, disabled, ...rest }: Props) {
  const { reduceMotion } = useTheme();
  const pressed = useSharedValue(0);
  // L'opacità da disattivato sta nello stile animato: uno stile statico verrebbe coperto.
  const base = disabled ? 0.4 : 1;
  const animated = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: base * (1 - pressed.get() * 0.3) }
      : { opacity: base, transform: [{ scale: 1 - pressed.get() * (1 - PRESS_SCALE) }] },
  );
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => pressed.set(withTiming(1, timing))}
      onPressOut={() => pressed.set(withTiming(0, timing))}
      {...rest}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
