import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { TaraText } from '@/components/TaraText';
import { useCatalog } from '@/data/CatalogProvider';
import { describeCatalog } from '@/data/catalogStatus';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const catalog = useCatalog();
  const status = describeCatalog(catalog.info, catalog.last, catalog.syncing);
  const rowStyle = [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }];
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.placeholder}>
        <TaraText variant="section">Profilo</TaraText>
        <TaraText color="textSecondary" style={styles.center}>
          Tipi di giornata e target, fase della dieta, stack integratori e notifiche.
        </TaraText>
      </View>

      {__DEV__ ? (
        // Solo nelle build di sviluppo: strumenti per provare l'app senza terminale.
        <View style={styles.section}>
          <TaraText variant="minimum" color="textSecondary">
            Sviluppo
          </TaraText>
          <View style={[styles.catalog, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TaraText>{status.title}</TaraText>
            <TaraText variant="caption" color="textSecondary">
              {status.detail}
            </TaraText>
          </View>
          <PressableScale onPress={catalog.refresh} disabled={catalog.syncing} style={rowStyle}>
            <TaraText>Aggiorna catalogo</TaraText>
          </PressableScale>
          <PressableScale onPress={() => router.push('/design')} style={rowStyle}>
            <TaraText>Catalogo dei componenti</TaraText>
            <Icon name="chevronRight" color="textSecondary" />
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.l },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s },
  center: { textAlign: 'center' },
  section: { gap: space.s },
  catalog: {
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    gap: space.xs,
  },
  row: {
    minHeight: touch.primary,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
