import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

type Kind = 'primary' | 'secondary' | 'quiet';

interface Props {
  label: string;
  onPress: () => void;
  /**
   * primary: pieno in `azione`, uno per schermata; secondary: contorno; quiet: solo testo,
   * per le azioni di contorno ("Cambia email").
   */
  kind?: Kind;
  disabled?: boolean;
  /** Mostra l'attesa al posto del testo e blocca il tocco, senza cambiare dimensione. */
  loading?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/** Pulsante di Tara: altezza 52 (44 per quiet), raggio dei pulsanti, testo `corpoForte`. */
export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
  testID,
}: Props) {
  const { colors } = useTheme();
  const textColor = kind === 'primary' ? 'background' : 'text';
  const shape =
    kind === 'primary'
      ? [styles.button, { backgroundColor: colors.action }]
      : kind === 'secondary'
        ? [styles.button, { borderColor: colors.borderStrong, borderWidth: 1 }]
        : styles.quiet;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      testID={testID}
      style={shape}
    >
      {/* Il testo resta per tenere la larghezza; durante l'attesa lo copre l'indicatore. */}
      <TaraText
        variant="bodyStrong"
        color={textColor}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={loading ? styles.hidden : null}
      >
        {label}
      </TaraText>
      {loading ? (
        <View style={styles.spinner}>
          <ActivityIndicator color={colors[textColor]} />
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    height: touch.primary,
    borderRadius: radius.button,
    paddingHorizontal: space.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quiet: {
    minHeight: touch.min,
    paddingHorizontal: space.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { opacity: 0 },
  spinner: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
