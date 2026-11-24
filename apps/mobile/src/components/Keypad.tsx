import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';

import type { KeypadKey } from '@/domain/gramEntry';
import type { WeightKey } from '@/domain/weight';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

const GRAM_KEYS: readonly KeypadKey[] = [
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

const DECIMAL_KEYS: readonly WeightKey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'comma',
  '0',
  'delete',
];

const LABELS: Partial<Record<KeypadKey | WeightKey, string>> = {
  tare: 'Imposta la tara',
  comma: 'Virgola',
  delete: 'Cancella una cifra',
};

type Props =
  | {
      decimal?: false;
      onKey: (key: KeypadKey) => void;
      /** Le cifre stanno andando nella tara: il tasto Tara resta acceso. */
      tareActive: boolean;
    }
  | {
      /** Al posto di Tara c'è la virgola: per i pesi in chili, come 82,4. */
      decimal: true;
      onKey: (key: WeightKey) => void;
      tareActive?: undefined;
    };

/**
 * Tastierino: cifre, Tara (o la virgola, con `decimal`) e cancella, con una vibrazione
 * leggera a ogni tasto. I `testID` sono `tasto-1`…, `tasto-tare`, `tasto-virgola`, `tasto-delete`.
 */
export function Keypad(props: Props) {
  const { colors } = useTheme();
  const keys: readonly (KeypadKey | WeightKey)[] = props.decimal ? DECIMAL_KEYS : GRAM_KEYS;
  const press = props.onKey as (key: KeypadKey | WeightKey) => void;
  return (
    <View style={styles.grid}>
      {keys.map((key) => {
        const active = key === 'tare' && props.tareActive === true;
        return (
          <PressableScale
            key={key}
            testID={key === 'comma' ? 'tasto-virgola' : `tasto-${key}`}
            accessibilityLabel={LABELS[key] ?? key}
            accessibilityState={{ selected: active }}
            onPress={() => {
              void Haptics.selectionAsync();
              press(key);
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
                {key === 'tare' ? 'Tara' : key === 'comma' ? ',' : key}
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
