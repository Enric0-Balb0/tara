import { type StyleProp, Text, type TextProps, type TextStyle } from 'react-native';

import { type ColorToken, type LabelColorToken, labelColors } from '@/theme/colors';
import { type TextRole, textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

interface Props extends Omit<TextProps, 'style'> {
  variant?: TextRole;
  /** Un token del tema, oppure un colore dell'etichetta (carta e inchiostro). */
  color?: ColorToken | LabelColorToken;
  style?: StyleProp<TextStyle>;
}

/** Testo di Tara: ruolo tipografico dei token, cifre tabellari, ingrandimento fino al 130%. */
export function TaraText({ variant = 'body', color = 'text', style, ...rest }: Props) {
  const theme = useTheme();
  const resolved =
    color in labelColors
      ? labelColors[color as LabelColorToken]
      : theme.colors[color as ColorToken];
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[textStyles[variant], { color: resolved, fontVariant: ['tabular-nums'] }, style]}
    />
  );
}
