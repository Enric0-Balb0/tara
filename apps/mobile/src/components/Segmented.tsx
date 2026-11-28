import { StyleSheet, View } from 'react-native';

import { radius, space, touch, verticalSlop } from '@/theme/layout';
import { textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

// Variante compatta: opzioni basse a vista, ma il tocco resta di 44 grazie a hitSlop, solo in
// verticale: tra un'opzione e l'altra ci sono 4 dp e i tocchi si sovrapporrebbero.
const COMPACT_HEIGHT = touch.min - space.s;
const COMPACT_SLOP = verticalSlop(COMPACT_HEIGHT);

interface Props {
  /** Nome del gruppo per il lettore dello schermo, es. "Pasto". */
  label: string;
  options: readonly { key: string; label: string }[];
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
  /**
   * Pillole larghe quanto il loro testo, con il bordo, per stare accanto a un titolo (il tipo
   * di giornata nell'intestazione di Oggi). Senza, opzioni a larghezze uguali a tutta riga.
   */
  compact?: boolean;
}

/**
 * Scelta tra poche opzioni tutte in vista (pasto, tipo di giornata): la stessa forma del
 * selettore crudo/cotto del foglio dei grammi. Un'opzione nascosta a destra non si
 * scoprirebbe, quindi niente scorrimento.
 */
export function Segmented({ label, options, selectedKey, onSelect, compact = false }: Props) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[
        styles.group,
        { backgroundColor: colors.surface },
        compact ? [styles.compactGroup, { borderColor: colors.border }] : null,
      ]}
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
            hitSlop={compact ? COMPACT_SLOP : undefined}
            style={[
              compact ? styles.compactOption : styles.option,
              selected ? { backgroundColor: colors.action } : null,
            ]}
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
  compactGroup: { borderWidth: 1, maxWidth: '100%', alignSelf: 'flex-start' },
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
  compactOption: {
    flexShrink: 1,
    minWidth: touch.min,
    height: COMPACT_HEIGHT,
    // Concentrico al gruppo: il raggio esterno meno il margine.
    borderRadius: radius.key - space.xs,
    paddingHorizontal: space.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { fontFamily: textStyles.bodyStrong.fontFamily },
});
