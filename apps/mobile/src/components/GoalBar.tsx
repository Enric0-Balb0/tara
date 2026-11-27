import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { rulerGeometry } from '@/domain/ruler';
import type { ColorToken } from '@/theme/colors';
import { curves, durations } from '@/theme/motion';
import { goalBar, ruler } from '@/theme/ruler';
import { useTheme } from '@/theme/useTheme';

const TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const OUTER = goalBar.height + 2 * goalBar.markOverhang;

interface Props {
  color: ColorToken;
  logged: number;
  /** Ancora previsto dal piano: tratteggio dopo il registrato. */
  planned?: number;
  /** Null senza target: niente segno del traguardo. */
  target: number | null;
}

/**
 * Barra sottile degli obiettivi (docs/design.md, "Barra graduata"): pieno il registrato,
 * tratteggio il previsto, tagli ogni 10% e segno al traguardo. Oltre il target il binario si
 * allunga e l'eccesso resta oltre il segno. Decorativa: il valore lo dice la riga.
 */
export function GoalBar({ color, logged, planned = 0, target }: Props) {
  const { colors, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const geometry = rulerGeometry(logged, planned, target);
  const fill = useSharedValue(0);

  // Il registrato cresce con un passaggio breve dopo una scrittura; fermo col movimento ridotto.
  useEffect(() => {
    const next = geometry.logged * width;
    fill.set(
      reduceMotion
        ? next
        : withTiming(next, {
            duration: durations.quick,
            easing: Easing.bezier(...curves.standard),
          }),
    );
  }, [fill, geometry.logged, reduceMotion, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: fill.get() }));
  const pattern = `tratteggio-obiettivo-${color}`;

  return (
    <View
      style={styles.outer}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[styles.track, { backgroundColor: colors[goalBar.trackColor] }]}
        pointerEvents="none"
      >
        <Animated.View style={[styles.fill, { backgroundColor: colors[color] }, fillStyle]} />
      </View>
      {width > 0 ? (
        <Svg width={width} height={OUTER} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Pattern
              id={pattern}
              width={ruler.hatchSpacing}
              height={ruler.hatchSpacing}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <Line
                x1={0}
                y1={0}
                x2={0}
                y2={ruler.hatchSpacing}
                stroke={colors[color]}
                strokeWidth={ruler.hatchWidth}
                strokeOpacity={ruler.hatchOpacity}
              />
            </Pattern>
          </Defs>
          {geometry.planned > 0 ? (
            <Rect
              x={geometry.logged * width}
              y={goalBar.markOverhang}
              width={geometry.planned * width}
              height={goalBar.height}
              fill={`url(#${pattern})`}
            />
          ) : null}
          {TICKS.map((tick) => (
            <Rect
              key={tick}
              x={(width * tick) / 10 - goalBar.cutWidth / 2}
              y={goalBar.markOverhang}
              width={goalBar.cutWidth}
              height={goalBar.height}
              fill={colors[goalBar.cutColor]}
            />
          ))}
          {geometry.target !== null ? (
            <Rect
              x={Math.min(
                Math.max(geometry.target * width - goalBar.markWidth / 2, 0),
                width - goalBar.markWidth,
              )}
              y={0}
              width={goalBar.markWidth}
              height={OUTER}
              fill={colors[goalBar.markColor]}
            />
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { height: OUTER, justifyContent: 'center' },
  track: { height: goalBar.height, borderRadius: goalBar.radius, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
});
