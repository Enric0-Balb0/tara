import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { TaraText } from './TaraText';

interface Props {
  /** Il titolo grande della schermata: "Oggi", "Piano". */
  title: string;
  /** Sotto il titolo, in secondario: la data in Oggi. */
  subtitle?: string;
  /** A destra del titolo: pulsanti da 44 (frecce dei giorni, profilo). */
  actions?: ReactNode;
  /** A destra del sottotitolo: il selettore del tipo di giornata in Oggi. */
  aside?: ReactNode;
}

/**
 * Intestazione delle quattro tab (docs/design.md, "Schermate"), al posto di quella nativa:
 * titolo grande a sinistra, azioni a destra, e sotto il sottotitolo con un eventuale
 * selettore. Resta ferma sopra il contenuto che scorre e tiene conto della barra di stato.
 */
export function ScreenHeader({ title, subtitle, actions, aside }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + space.s, backgroundColor: colors.background },
      ]}
    >
      <View style={styles.titleRow}>
        <TaraText
          variant="title"
          accessibilityRole="header"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={styles.title}
        >
          {title}
        </TaraText>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {subtitle !== undefined || aside ? (
        <View style={styles.subtitleRow}>
          {subtitle === undefined ? null : (
            <TaraText color="textSecondary" numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </TaraText>
          )}
          {aside ? <View style={styles.aside}>{aside}</View> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.l, paddingBottom: space.s },
  titleRow: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: space.s },
  title: { flex: 1 },
  // Le icone hanno margini propri dentro i 44: l'ultima si allinea al bordo del contenuto.
  actions: { flexDirection: 'row', alignItems: 'center', marginRight: -space.s },
  subtitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    columnGap: space.m,
    rowGap: space.xs,
  },
  subtitle: { flexShrink: 1 },
  aside: { marginLeft: 'auto', maxWidth: '100%' },
});
