import { StyleSheet, View } from 'react-native';

import { radius, space, touch } from '@/theme/layout';
import { textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

interface Props {
  /** Nome del gruppo per il lettore dello schermo, es. "Pasto". */
  label: string;
  options: readonly { key: string; label: string }[];
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
}

/**
 * Scelta tra poche opzioni tutte in vista, a larghezze uguali (pasto, tipo di giornata):
 * la stessa forma del selettore crudo/cotto del foglio dei grammi. Un'opzione nascosta a
 * destra non si scoprirebbe, quindi niente scorrimento.
 */
export function Segmented({ label, options, selectedKey, onSelect }: Props) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.group, { backgroundColor: colors.surface }]}
    >
      {options.map((option) => {
        const selected = option.key === selectedKey;
        return (
          <PressableScale
            key={option.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            onPress={() => onSelect(option.key)}
            style={[styles.option, selected ? { backgroundColor: colors.action } : null]}
          >
            <TaraText
              variant="caption"
              color={selected ? 'background' : 'textSecondary'}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={selected ? styles.selected : null}
            >
              {option.label}
            </TaraText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', borderRadius: radius.key, padding: space.xs, gap: space.xs },
  // Larghezze uguali: senza minWidth 0 l'etichetta più lunga allarga la sua opzione.
  option: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: touch.min,
    borderRadius: radius.field,
    paddingHorizontal: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { fontFamily: textStyles.bodyStrong.fontFamily },
});
