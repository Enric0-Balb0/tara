import { StyleSheet, View } from 'react-native';

import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

interface Props {
  onSearch: () => void;
  /** Senza, lo scanner non c'è: arriva con i prodotti di marca (RF-10, F1). */
  onScan?: () => void;
}

/** Ricerca e scanner, sempre in basso sopra le tab: a un tocco da ogni schermata. */
export function SearchDock({ onSearch, onScan }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.dock, { backgroundColor: colors.background, borderTopColor: colors.border }]}
    >
      <PressableScale
        onPress={onSearch}
        accessibilityLabel="Cerca un alimento"
        style={[
          styles.search,
          { backgroundColor: colors.surface, borderColor: colors.borderStrong },
        ]}
      >
        <Icon name="search" color="text" size={20} />
        <TaraText color="textSecondary">Cerca un alimento</TaraText>
      </PressableScale>
      {onScan ? (
        <PressableScale
          onPress={onScan}
          accessibilityLabel="Scansiona un codice a barre"
          style={[styles.scan, { backgroundColor: colors.action }]}
        >
          <Icon name="scan" color="background" />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    gap: space.m,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  search: {
    flex: 1,
    height: touch.primary,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
  },
  scan: {
    width: touch.primary,
    height: touch.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
