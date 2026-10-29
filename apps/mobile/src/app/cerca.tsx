import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ResultRow } from '@/components/ResultRow';
import { SearchField } from '@/components/SearchField';
import { TaraText } from '@/components/TaraText';
import { useCatalog } from '@/data/CatalogProvider';
import { type FoodHit, searchFoods } from '@/data/catalogStore';
import type { SqlDatabase } from '@/data/sql';
import { searchStatus } from '@/domain/searchStatus';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

/** "Cerca un alimento": a ogni lettera cerca nel catalogo sul telefono, anche offline. */
export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const db: SqlDatabase = useSQLiteContext();
  const { info } = useCatalog();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FoodHit[]>([]);
  const latest = useRef(0);
  const catalogSize = info?.foodCount;

  useEffect(() => {
    const request = ++latest.current;
    void searchFoods(db, query).then((found) => {
      // Solo l'ultima ricerca conta: una più lenta, arrivata dopo, non copre la nuova.
      if (request === latest.current) setHits(found);
    });
    // catalogSize: se il catalogo arriva mentre la schermata è aperta, si cerca di nuovo.
  }, [db, query, catalogSize]);

  // Finché lo stato del catalogo non è letto, niente messaggi: sarebbero sbagliati.
  const status = catalogSize === undefined ? null : searchStatus(query, hits.length, catalogSize);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.top}>
        <SearchField value={query} onChangeText={setQuery} autoFocus />
      </View>
      <FlatList
        data={hits}
        keyExtractor={(hit) => hit.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <ResultRow
            name={item.name}
            state={item.state}
            kcalPer100={item.per100.energy_kcal}
            proteinPer100={item.per100.protein_g}
            onPress={() => router.push({ pathname: '/alimento/[id]', params: { id: item.id } })}
          />
        )}
        ListFooterComponent={
          status?.message ? (
            <TaraText color="textSecondary" style={styles.message}>
              {status.message}
            </TaraText>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { paddingHorizontal: space.l, paddingBottom: space.m },
  message: { paddingHorizontal: space.l, paddingVertical: space.xl, textAlign: 'center' },
});
