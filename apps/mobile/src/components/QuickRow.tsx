import { StyleSheet, View } from 'react-native';

import type { FoodState } from '@/domain/food';
import { space, touch } from '@/theme/layout';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { StateTag } from './StateTag';
import { TaraText } from './TaraText';

interface Props {
  name: string;
  state: FoodState;
  /** A destra, es. "ultima volta 200 g". */
  detail?: string;
  onPress: () => void;
}

/** Un alimento recente o preferito sotto la ricerca vuota (RF-44): un tocco apre la scheda. */
export function QuickRow({ name, state, detail, onPress }: Props) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${name}${state === 'cooked' ? ', cotto' : ''}${detail ? `, ${detail}` : ''}`}
      style={styles.row}
    >
      <View style={styles.name}>
        <TaraText numberOfLines={1} style={styles.nameText}>
          {name}
        </TaraText>
        <StateTag state={state} />
      </View>
      {detail ? (
        <TaraText variant="caption" color="textSecondary" numberOfLines={1}>
          {detail}
        </TaraText>
      ) : null}
      <Icon name="chevronRight" color="textSecondary" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: space.l,
  },
  name: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s, minWidth: 0 },
  nameText: { flexShrink: 1 },
});
