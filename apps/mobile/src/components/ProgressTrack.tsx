import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Rect } from 'react-native-svg';

import { space } from '@/theme/layout';
import { curves, durations, INDETERMINATE_STEP_MS } from '@/theme/motion';
import { ruler } from '@/theme/ruler';
import { useTheme } from '@/theme/useTheme';

const TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

interface Props {
  /** Frazione completata, solo se misurata; null quando non si sa quanto manca. */
  fraction: number | null;
  /** Cosa sta succedendo, per il lettore dello schermo. */
  accessibilityLabel: string;
  testID?: string;
}

/**
 * Avanzamento con la forma della barra graduata: binario, tacche ogni 10%, parte piena.
 * Senza una frazione misurata la parte piena diventa un tratteggio che scorre (fermo con il
 * movimento ridotto): un'attesa vera, non una percentuale inventata.
 */
export function ProgressTrack({ fraction, accessibilityLabel, testID }: Props) {
  const { colors, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const fill = useSharedValue(0);
  const shift = useSharedValue(0);
  const step = ruler.hatchSpacing;
  const determinate = fraction !== null;

  useEffect(() => {
    if (fraction === null) return;
    const next = Math.min(Math.max(fraction, 0), 1) * width;
    fill.set(
      reduceMotion
        ? next
        : withTiming(next, { duration: durations.quick, easing: Easing.bezier(...curves.standard) }),
    );
  }, [fill, fraction, reduceMotion, width]);

  useEffect(() => {
    if (determinate || reduceMotion) {
      cancelAnimation(shift);
      shift.set(0);
      return;
    }
    // Un passo del tratteggio a velocità costante, all'infinito: il ciclo non si vede.
    shift.set(0);
    shift.set(
      withRepeat(withTiming(step, { duration: INDETERMINATE_STEP_MS, easing: Easing.linear }), -1),
    );
    return () => cancelAnimation(shift);
  }, [determinate, reduceMotion, shift, step]);

  const fillStyle = useAnimatedStyle(() => ({ width: fill.get() }));
  const hatchStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.get() - step }] }));

  const hatchWidth = width + step;
  const lines = Array.from({ length: Math.ceil(hatchWidth / step) + 1 }, (_, i) => i * step);

  return (
    <View
      accessible
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={
        determinate ? { min: 0, max: 100, now: Math.round(fraction * 100) } : undefined
      }
      style={styles.track}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Svg width={width} height={ruler.track} style={StyleSheet.absoluteFill}>
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
      {determinate ? (
        <Animated.View style={[styles.fill, { backgroundColor: colors.text }, fillStyle]} />
      ) : width > 0 ? (
        <View style={styles.band}>
          <Animated.View style={hatchStyle}>
            <Svg width={hatchWidth} height={ruler.fill}>
              {lines.map((x) => (
                <Line
                  key={x}
                  x1={x}
                  y1={ruler.fill}
                  x2={x + ruler.fill}
                  y2={0}
                  stroke={colors.text}
                  strokeWidth={ruler.hatchWidth}
                  strokeOpacity={ruler.hatchOpacity}
                />
              ))}
            </Svg>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: ruler.track, justifyContent: 'flex-end', marginVertical: space.xs },
  fill: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: ruler.fill,
    borderTopRightRadius: ruler.fillRadius,
    borderBottomRightRadius: ruler.fillRadius,
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: ruler.fill,
    overflow: 'hidden',
  },
});
