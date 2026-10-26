import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';

import type { KeypadKey } from '@/domain/gramEntry';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

const KEYS: readonly KeypadKey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'tare',
  '0',
  'delete',
];

const LABELS: Partial<Record<KeypadKey, string>> = {
  tare: 'Imposta la tara',
  delete: 'Cancella una cifra',
};

interface Props {
  onKey: (key: KeypadKey) => void;
  /** Le cifre stanno andando nella tara: il tasto Tara resta acceso. */
  tareActive: boolean;
}

/** Tastierino dei grammi: cifre, Tara e cancella, con una vibrazione leggera a ogni tasto. */
export function Keypad({ onKey, tareActive }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      {KEYS.map((key) => {
        const active = key === 'tare' && tareActive;
        return (
          <PressableScale
            key={key}
            testID={`tasto-${key}`}
            accessibilityLabel={LABELS[key] ?? key}
            accessibilityState={{ selected: active }}
            onPress={() => {
              void Haptics.selectionAsync();
              onKey(key);
            }}
            style={[
              styles.key,
              {
                backgroundColor: active ? colors.action : colors.raised,
                borderColor: colors.border,
              },
            ]}
          >
            {key === 'delete' ? (
              <Icon name="delete" color="text" />
            ) : (
              <TaraText
                variant={key === 'tare' ? 'bodyStrong' : 'bigNumber'}
                color={active ? 'background' : 'text'}
              >
                {key === 'tare' ? 'Tara' : key}
              </TaraText>
            )}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  key: {
    flexBasis: '31%',
    flexGrow: 1,
    height: touch.key,
    borderRadius: radius.key,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
