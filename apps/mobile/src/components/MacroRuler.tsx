import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { formatAmount } from '@/domain/format';
import { rulerGeometry } from '@/domain/ruler';
import type { MacroToken } from '@/theme/colors';
import { space } from '@/theme/layout';
import { curves, durations } from '@/theme/motion';
import { ruler } from '@/theme/ruler';
import { useTheme } from '@/theme/useTheme';

import { TaraText } from './TaraText';

const TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

interface Props {
  macro: MacroToken;
  label: string;
  logged: number;
  /** Ancora previsto dal piano, disegnato a tratteggio dopo il registrato. */
  planned?: number;
  target: number | null;
}

/** Barra graduata: tacche ogni 10%, pieno il registrato, tratteggio il previsto, segno al traguardo. */
export function MacroRuler({ macro, label, logged, planned = 0, target }: Props) {
  const { colors, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const geometry = rulerGeometry(logged, planned, target);
  const fill = useSharedValue(0);

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
  const color = colors[macro];
  const pattern = `tratteggio-${macro}`;
  const targetText = target === null ? '–' : formatAmount(target, 'grams');
  const plannedText = planned > 0 ? `, ${formatAmount(planned, 'grams')} previsti dal piano` : '';

  return (
    <View
      accessible
      accessibilityLabel={`${label} ${formatAmount(logged, 'grams')} di ${targetText} grammi${plannedText}`}
      style={styles.ruler}
    >
      <View style={styles.header}>
        <TaraText variant="bodyStrong" color={macro}>
          {label}
        </TaraText>
        <TaraText color="textSecondary">
          <TaraText variant="bigNumber">{formatAmount(logged, 'grams')}</TaraText> / {targetText} g
        </TaraText>
      </View>
      <View style={styles.track} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={ruler.track}>
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
                  stroke={color}
                  strokeWidth={ruler.hatchWidth}
                  strokeOpacity={ruler.hatchOpacity}
                />
              </Pattern>
            </Defs>
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
            {geometry.planned > 0 ? (
              <Rect
                x={geometry.logged * width}
                y={ruler.track - ruler.fill}
                width={geometry.planned * width}
                height={ruler.fill}
                fill={`url(#${pattern})`}
              />
            ) : null}
            {geometry.target !== null ? (
              <Rect
                x={Math.max(geometry.target * width - ruler.markWidth, 0)}
                y={0}
                width={ruler.markWidth}
                height={ruler.track}
                fill={colors.text}
              />
            ) : null}
          </Svg>
        ) : null}
        <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ruler: { gap: space.s },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
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
