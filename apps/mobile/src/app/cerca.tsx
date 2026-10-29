import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { ResultRow } from '@/components/ResultRow';
import { SearchField } from '@/components/SearchField';
import { TaraText } from '@/components/TaraText';
import { useCatalog } from '@/data/CatalogProvider';
import { type FoodHit, searchFoods } from '@/data/catalogStore';
import type { SqlDatabase } from '@/data/sql';
import { searchStatus } from '@/domain/searchStatus';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

/** "Cerca un alimento": a ogni lettera cerca nel catalogo sul telefono, anche offline. */
export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const db: SqlDatabase = useSQLiteContext();
  const { info, syncing, refresh } = useCatalog();
  const [query, setQuery] = useState('');
  // I risultati restano legati alla ricerca che li ha prodotti.
  const [results, setResults] = useState<{ query: string; hits: FoodHit[] } | null>(null);
  const latest = useRef(0);
  const retried = useRef(false);
  const catalogSize = info?.foodCount;

  useEffect(() => {
    const request = ++latest.current;
    searchFoods(db, query)
      .then((hits) => {
        // Solo l'ultima ricerca conta: una più lenta, arrivata dopo, non copre la nuova.
        if (request === latest.current) setResults({ query, hits });
      })
      .catch((error: unknown) => console.error('Ricerca non riuscita', error));
    // catalogSize: se il catalogo arriva mentre la schermata è aperta, si cerca di nuovo.
  }, [db, query, catalogSize]);

  // Senza catalogo sul telefono si riprova una volta da soli: forse la connessione è tornata.
  useEffect(() => {
    if (catalogSize === 0 && !syncing && !retried.current) {
      retried.current = true;
      refresh();
    }
  }, [catalogSize, syncing, refresh]);

  // Finché lo stato del catalogo non è letto, niente messaggi: sarebbero sbagliati.
  const status =
    catalogSize === undefined
      ? null
      : searchStatus({
          query,
          results: results && { query: results.query, count: results.hits.length },
          catalogSize,
          syncing,
        });

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.top}>
        <SearchField value={query} onChangeText={setQuery} autoFocus />
      </View>
      <FlatList
        data={results?.hits ?? []}
        keyExtractor={(hit) => hit.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <ResultRow
            name={item.name}
            state={item.state}
            cooking={item.cooking}
            kcalPer100={item.per100.energy_kcal}
            proteinPer100={item.per100.protein_g}
            onPress={() => router.push({ pathname: '/alimento/[id]', params: { id: item.id } })}
          />
        )}
        ListFooterComponent={
          status?.message ? (
            <View style={styles.footer}>
              <TaraText color="textSecondary" style={styles.message}>
                {status.message}
              </TaraText>
              {status.kind === 'offline' ? (
                <PressableScale
                  onPress={refresh}
                  style={[styles.retry, { borderColor: colors.borderStrong }]}
                >
                  <TaraText variant="bodyStrong">Riprova</TaraText>
                </PressableScale>
              ) : null}
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { paddingHorizontal: space.l, paddingBottom: space.m },
  footer: {
    paddingHorizontal: space.l,
    paddingVertical: space.xl,
    alignItems: 'center',
    gap: space.l,
  },
  message: { textAlign: 'center' },
  retry: {
    minHeight: touch.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
