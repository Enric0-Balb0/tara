import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { filledTicks, rulerGeometry, visibleFill } from '@/domain/ruler';
import type { ColorToken } from '@/theme/colors';
import { curves, durations } from '@/theme/motion';
import { goalBar, ruler } from '@/theme/ruler';
import { useTheme } from '@/theme/useTheme';

const OUTER = goalBar.height + 2 * goalBar.markOverhang;

interface Props {
  color: ColorToken;
  logged: number;
  /** Ancora previsto dal piano: tratteggio dopo il registrato. */
  planned?: number;
  /** Null senza target: niente segno del traguardo. */
  target: number | null;
  /**
   * Il giorno dei valori mostrati: quando cambia la barra salta al valore nuovo senza
   * passaggio, come al primo disegno. Si muove solo dopo una scrittura dello stesso giorno.
   */
  day?: string;
}

/**
 * Barra sottile degli obiettivi (docs/design.md, "Barra graduata"): pieno il registrato (almeno
 * 4 dp se c'è qualcosa, con i suoi angoli), tratteggio il previsto, tagli ogni 10% solo sulla
 * parte piena e segno al traguardo. Oltre il target il binario si allunga e l'eccesso resta
 * oltre il segno. Decorativa: il valore lo dice la riga.
 */
export function GoalBar({ color, logged, planned = 0, target, day }: Props) {
  const { colors, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const geometry = rulerGeometry(logged, planned, target);
  const loggedWidth = visibleFill(geometry.logged, width, goalBar.minFill);
  const plannedEnd = Math.min((geometry.logged + geometry.planned) * width, width);
  const fill = useSharedValue(0);
  const shown = useRef({ width: 0, day });

  // Il registrato cresce con un passaggio breve dopo una scrittura. Al primo disegno, quando
  // cambia la larghezza o il giorno e con il movimento ridotto il valore si mette e basta.
  useEffect(() => {
    const jump = reduceMotion || shown.current.width !== width || shown.current.day !== day;
    shown.current = { width, day };
    fill.set(
      jump
        ? loggedWidth
        : withTiming(loggedWidth, {
            duration: durations.quick,
            easing: Easing.bezier(...curves.standard),
          }),
    );
  }, [day, fill, loggedWidth, reduceMotion, width]);

  // Angoli propri, mai più di metà della larghezza: pochi grammi sono una tacca, non "(".
  const fillStyle = useAnimatedStyle(() => {
    const current = fill.get();
    return { width: current, borderRadius: Math.min(goalBar.radius, current / 2) };
  });
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
          {plannedEnd > loggedWidth ? (
            <Rect
              x={loggedWidth}
              y={goalBar.markOverhang}
              width={plannedEnd - loggedWidth}
              height={goalBar.height}
              fill={`url(#${pattern})`}
            />
          ) : null}
          {filledTicks(geometry.logged + geometry.planned).map((tick) => (
            <Rect
              key={tick}
              x={width * tick - goalBar.cutWidth / 2}
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
  // Senza ritaglio: la parte piena ha i suoi angoli e non diventa una scheggia curva.
  track: { height: goalBar.height, borderRadius: goalBar.radius },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
});
