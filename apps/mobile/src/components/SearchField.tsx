import { StyleSheet, TextInput, View } from 'react-native';

import { radius, space, touch } from '@/theme/layout';
import { textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  autoFocus?: boolean;
}

/** Campo "Cerca un alimento": stessa forma della barra in basso, con il tasto per svuotarlo. */
export function SearchField({ value, onChangeText, autoFocus = false }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}
    >
      <Icon name="search" color="text" size={20} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
        placeholder="Cerca un alimento"
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel="Cerca un alimento"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        selectionColor={colors.text}
        maxFontSizeMultiplier={1.3}
        style={[styles.input, { color: colors.text }]}
      />
      {value !== '' ? (
        <PressableScale
          onPress={() => onChangeText('')}
          accessibilityLabel="Cancella la ricerca"
          style={styles.clear}
        >
          <Icon name="close" color="textSecondary" size={20} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: touch.primary,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingLeft: space.l,
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    fontFamily: textStyles.body.fontFamily,
    fontSize: textStyles.body.fontSize,
  },
  clear: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
