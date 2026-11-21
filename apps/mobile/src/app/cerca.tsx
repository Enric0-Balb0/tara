import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { ProgressTrack } from '@/components/ProgressTrack';
import { ResultRow } from '@/components/ResultRow';
import { SearchField } from '@/components/SearchField';
import { TaraText } from '@/components/TaraText';
import { useCatalog } from '@/data/CatalogProvider';
import { type FoodHit, searchFoods } from '@/data/catalogStore';
import type { SqlDatabase } from '@/data/sql';
import { catalogReadyNotice, downloadProgress, searchStatus } from '@/domain/searchStatus';
import { radius, space, touch } from '@/theme/layout';
import { durations } from '@/theme/motion';
import { useTheme } from '@/theme/useTheme';

/**
 * "Cerca un alimento": a ogni lettera cerca nel catalogo sul telefono, anche offline. Pasto e
 * giorno, se arrivano da "Aggiungi" in Oggi, passano alla scheda per la voce del diario.
 */
export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { slot, date } = useLocalSearchParams<{ slot?: string; date?: string }>();
  const db: SqlDatabase = useSQLiteContext();
  const { info, syncing, progress, refresh } = useCatalog();
  const [query, setQuery] = useState('');
  // I risultati restano legati alla ricerca che li ha prodotti.
  const [results, setResults] = useState<{ query: string; hits: FoodHit[] } | null>(null);
  const latest = useRef(0);
  const retried = useRef(false);
  const catalogSize = info?.foodCount;
  const catalogVersion = info?.version;

  // Se la schermata ha visto il telefono senza alimenti, quando arrivano lo dice: l'avviso
  // resta finché la ricerca non cambia.
  const [waitedForCatalog, setWaitedForCatalog] = useState(false);
  const [ready, setReady] = useState<{ foodCount: number; query: string } | null>(null);
  if (catalogSize === 0 && !waitedForCatalog) setWaitedForCatalog(true);
  if (waitedForCatalog && catalogSize !== undefined && catalogSize > 0) {
    setWaitedForCatalog(false);
    setReady({ foodCount: catalogSize, query });
  }
  const notice =
    ready !== null && ready.query === query ? catalogReadyNotice(ready.foodCount) : null;

  useEffect(() => {
    if (ready !== null) {
      AccessibilityInfo.announceForAccessibility(catalogReadyNotice(ready.foodCount));
    }
  }, [ready]);

  useEffect(() => {
    const request = ++latest.current;
    searchFoods(db, query)
      .then((hits) => {
        // Solo l'ultima ricerca conta: una più lenta, arrivata dopo, non copre la nuova.
        if (request === latest.current) setResults({ query, hits });
      })
      .catch((error: unknown) => console.error('Ricerca non riuscita', error));
    // catalogVersion: se arriva un catalogo mentre la schermata è aperta, si cerca di nuovo,
    // così i risultati della ricerca già scritta compaiono da soli.
  }, [db, query, catalogVersion]);

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
        ListHeaderComponent={
          notice ? (
            <Animated.View
              entering={FadeIn.duration(durations.entry)}
              accessibilityLiveRegion="polite"
              style={[styles.notice, { borderColor: colors.border }]}
            >
              <Icon name="check" color="text" size={20} />
              <TaraText variant="bodyStrong">{notice}</TaraText>
            </Animated.View>
          ) : undefined
        }
        renderItem={({ item }) => (
          <ResultRow
            name={item.name}
            state={item.state}
            cooking={item.cooking}
            kcalPer100={item.per100.energy_kcal}
            proteinPer100={item.per100.protein_g}
            onPress={() =>
              router.push({
                pathname: '/alimento/[id]',
                params: { id: item.id, ...(slot ? { slot } : {}), ...(date ? { date } : {}) },
              })
            }
          />
        )}
        ListFooterComponent={
          status?.kind === 'downloading' && status.message ? (
            <Download headline={status.message} {...downloadProgress(progress)} />
          ) : status?.message ? (
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

/** Il primo download: cosa succede, la barra e la fase in parole. */
function Download({
  headline,
  detail,
  fraction,
}: {
  headline: string;
  detail: string;
  fraction: number | null;
}) {
  return (
    <View style={styles.download}>
      <TaraText variant="bodyStrong">{headline}</TaraText>
      <ProgressTrack
        fraction={fraction}
        accessibilityLabel={`${headline} ${detail}`}
        testID="avanzamento-alimenti"
      />
      <TaraText variant="caption" color="textSecondary">
        {detail}
      </TaraText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { paddingHorizontal: space.l, paddingBottom: space.m },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  download: {
    paddingHorizontal: space.l,
    paddingVertical: space.xl,
    gap: space.s,
  },
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
