import { StyleSheet, View } from 'react-native';

import type { FoodState } from '@/domain/food';
import { radius, space } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { TaraText } from './TaraText';

/** "cotto" accanto al nome; crudo (il predefinito) e n.a. non hanno etichetta. */
export function StateTag({ state }: { state: FoodState }) {
  const { colors } = useTheme();
  if (state !== 'cooked') return null;
  return (
    <View style={[styles.tag, { borderColor: colors.borderStrong }]}>
      <TaraText variant="minimum" color="textSecondary">
        cotto
      </TaraText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { borderWidth: 1, borderRadius: radius.label, paddingHorizontal: space.xs },
});
