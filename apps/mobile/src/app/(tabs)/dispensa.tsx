import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PressableScale } from '@/components/PressableScale';
import { StateTag } from '@/components/StateTag';
import { TaraText } from '@/components/TaraText';
import { type PersonalFood, personalFoods } from '@/data/foodsStore';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import { formatAmount } from '@/domain/format';
import { space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

/**
 * Dispensa: il catalogo personale (RF-02, RF-18). I prodotti inseriti qui si trovano nella
 * ricerca come i generici; ricette e pasti salvati arriveranno accanto.
 */
export default function PantryScreen() {
  const db: SqlDatabase = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;
  // undefined: si sta leggendo.
  const [foods, setFoods] = useState<PersonalFood[] | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      if (userId === undefined) return undefined;
      let current = true;
      void personalFoods(db, userId)
        .then((list) => {
          if (current) setFoods(list);
        })
        .catch((error: unknown) => console.error('Dispensa non letta', error));
      return () => {
        current = false;
      };
    }, [db, userId]),
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      data={foods ?? []}
      keyExtractor={(food) => food.id}
      testID="dispensa"
      ListHeaderComponent={
        <View style={styles.header}>
          <Button label="Nuovo alimento" onPress={() => router.push('/nuovo-alimento')} />
          {foods && foods.length > 0 ? (
            <TaraText variant="bodyStrong" accessibilityRole="header">
              I tuoi alimenti
            </TaraText>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        foods ? (
          <TaraText color="textSecondary" style={styles.empty}>
            Qui trovi i prodotti che inserisci tu: copi l&apos;etichetta una volta, poi li cerchi
            come tutti gli altri.
          </TaraText>
        ) : undefined
      }
      renderItem={({ item }) => {
        const kcal = formatAmount(item.kcal, 'kcal');
        return (
          <PressableScale
            onPress={() => router.push({ pathname: '/alimento/[id]', params: { id: item.id } })}
            accessibilityLabel={`${item.name}${item.brand ? `, ${item.brand}` : ''}, ${kcal} kcal per 100 ${item.baseUnit === 'ml' ? 'millilitri' : 'grammi'}`}
            style={[styles.row, { borderBottomColor: colors.border }]}
          >
            <View style={styles.text}>
              <View style={styles.name}>
                <TaraText numberOfLines={2} style={styles.shrink}>
                  {item.name}
                </TaraText>
                <StateTag state={item.state} />
              </View>
              {item.brand ? (
                <TaraText variant="minimum" color="textSecondary" numberOfLines={1}>
                  {item.brand}
                </TaraText>
              ) : null}
            </View>
            <View style={styles.value}>
              <TaraText variant="number">{kcal}</TaraText>
              <TaraText variant="minimum" color="textSecondary">
                kcal/100 {item.baseUnit}
              </TaraText>
            </View>
          </PressableScale>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl },
  header: { padding: space.l, gap: space.l },
  empty: { paddingHorizontal: space.l },
  row: {
    minHeight: touch.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1 },
  name: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  shrink: { flexShrink: 1 },
  value: { alignItems: 'flex-end' },
});
