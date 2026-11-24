import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { formatNumber } from '@/domain/format';
import type { ChartPoint, ChartSeries } from '@/domain/weight';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { TaraText } from './TaraText';

const HEIGHT = 160;
const PAD = 8;
const AXIS = 44;

interface Props {
  series: ChartSeries;
  days: number;
  accessibilityLabel: string;
}

/**
 * Grafico del peso (RF-70): punti delle pesate in `textSecondary`, linea della media mobile in
 * `text`, asse zoomato sull'intervallo reale, nessun riempimento sotto la linea.
 */
export function WeightChart({ series, days, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const plotWidth = Math.max(width - AXIS, 0);
  const span = series.max - series.min || 1;
  const x = (index: number) => AXIS + PAD + (index / Math.max(days - 1, 1)) * (plotWidth - 2 * PAD);
  const y = (kg: number) => PAD + (1 - (kg - series.min) / span) * (HEIGHT - 2 * PAD);
  const line = series.average
    .map((point: ChartPoint, i) => `${i === 0 ? 'M' : 'L'}${x(point.index)} ${y(point.kg)}`)
    .join(' ');

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={styles.box}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          <Line x1={AXIS} x2={width} y1={PAD} y2={PAD} stroke={colors.border} strokeWidth={1} />
          <Line
            x1={AXIS}
            x2={width}
            y1={HEIGHT - PAD}
            y2={HEIGHT - PAD}
            stroke={colors.border}
            strokeWidth={1}
          />
          {series.average.length > 1 ? (
            <Path
              d={line}
              stroke={colors.text}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {series.points.map((point) => (
            <Circle
              key={point.index}
              cx={x(point.index)}
              cy={y(point.kg)}
              r={3}
              fill={colors.textSecondary}
            />
          ))}
        </Svg>
      ) : null}
      <View style={[styles.axis, { top: 0 }]} pointerEvents="none">
        <TaraText variant="minimum" color="textSecondary">
          {formatNumber(series.max, 1)}
        </TaraText>
      </View>
      <View style={[styles.axis, { bottom: 0 }]} pointerEvents="none">
        <TaraText variant="minimum" color="textSecondary">
          {formatNumber(series.min, 1)}
        </TaraText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: HEIGHT },
  axis: { position: 'absolute', left: 0, width: AXIS - space.xs, alignItems: 'flex-end' },
});
