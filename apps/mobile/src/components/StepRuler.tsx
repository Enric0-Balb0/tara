import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Rect } from 'react-native-svg';

import { curves, durations } from '@/theme/motion';
import { ruler } from '@/theme/ruler';
import { useTheme } from '@/theme/useTheme';

const TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

interface Props {
  /** Passo corrente, da 1. */
  step: number;
  total: number;
}

/**
 * Avanzamento di un percorso a passi disegnato come la barra graduata dei macro: stesse
 * tacche ogni 10% e stessa linea di base, ma riempita in `azione`, perché il colore resta
 * ai macro. La parte piena scorre al passo successivo in `rapido`.
 */
export function StepRuler({ step, total }: Props) {
  const { colors, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const fill = useSharedValue(0);

  useEffect(() => {
    const next = (Math.min(step, total) / total) * width;
    fill.set(
      reduceMotion
        ? next
        : withTiming(next, { duration: durations.quick, easing: Easing.bezier(...curves.standard) }),
    );
  }, [fill, reduceMotion, step, total, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: fill.get() }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Passo ${step} di ${total}`}
      accessibilityValue={{ min: 0, max: total, now: step }}
      style={styles.track}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Svg width={width} height={ruler.track}>
          {TICKS.map((tick) => (
            <Line
              key={tick}
              x1={(width * tick) / 10}
              x2={(width * tick) / 10}
              y1={ruler.tickInset}
              y2={ruler.track - ruler.tickInset}
              stroke={colors[ruler.tickColor]}
              strokeWidth={1}
            />
          ))}
          <Rect
            x={0}
            y={ruler.track - ruler.tickInset}
            width={width}
            height={ruler.tickInset}
            fill={colors[ruler.baseColor]}
          />
        </Svg>
      ) : null}
      <Animated.View style={[styles.fill, { backgroundColor: colors.action }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: ruler.track, justifyContent: 'flex-end' },
  fill: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: ruler.fill,
    borderTopRightRadius: ruler.fillRadius,
    borderBottomRightRadius: ruler.fillRadius,
  },
});
