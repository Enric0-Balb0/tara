import { type ComponentRef, type Ref, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { radius, space, touch } from '@/theme/layout';
import { type TextRole, textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

import { TaraText } from './TaraText';

interface Props extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  ref?: Ref<ComponentRef<typeof TextInput>>;
  /** Etichetta sopra il campo, letta anche dal lettore dello schermo. */
  label: string;
  /** Ruolo tipografico del testo scritto: `bigNumber` per un codice, come un display. */
  variant?: TextRole;
  /** Bordo `error` quando il valore è stato rifiutato; il messaggio lo mostra chi lo usa. */
  invalid?: boolean;
}

/**
 * Campo di testo di Tara: etichetta in alto, campo in `rialzo`; il bordo passa al colore
 * del testo quando il campo ha il focus e a `errore` quando il valore è stato rifiutato.
 */
export function TextField({
  ref,
  label,
  variant = 'body',
  invalid = false,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const text = textStyles[variant];
  const border = invalid ? colors.error : focused ? colors.text : colors.borderStrong;
  return (
    <View style={styles.wrapper}>
      <TaraText variant="minimum" color="textSecondary">
        {label}
      </TaraText>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        selectionColor={colors.text}
        cursorColor={colors.text}
        maxFontSizeMultiplier={1.3}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...rest}
        style={[
          styles.input,
          {
            backgroundColor: colors.raised,
            borderColor: border,
            color: colors.text,
            fontFamily: text.fontFamily,
            fontSize: text.fontSize,
            fontVariant: ['tabular-nums'],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: space.s },
  input: {
    minHeight: touch.primary,
    borderRadius: radius.field,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
  },
});
