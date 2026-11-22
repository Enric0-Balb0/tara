import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, FlatList, Modal, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GramSheet } from '@/components/GramSheet';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { ProgressTrack } from '@/components/ProgressTrack';
import { QuickRow } from '@/components/QuickRow';
import { ResultRow } from '@/components/ResultRow';
import { SavedMealSheet } from '@/components/SavedMealSheet';
import { SearchField } from '@/components/SearchField';
import { TaraText } from '@/components/TaraText';
import { useCatalog } from '@/data/CatalogProvider';
import { type FoodHit, searchFoods } from '@/data/catalogStore';
import { ensureMealSlots } from '@/data/diaryStore';
import { getDraft } from '@/data/recipeDraft';
import { ingredientValues, recipesContaining } from '@/data/recipesStore';
import {
  favorites as loadFavorites,
  type QuickFood,
  type RecentFood,
  recentFoods,
} from '@/data/quickStore';
import {
  logSavedMeal,
  type SavedMealItem,
  type SavedMealSummary,
  savedMealItems,
  savedMeals as loadSavedMeals,
} from '@/data/savedMealsStore';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import { foodCountLabel, toLocalDate } from '@/domain/diary';
import { formatAmount } from '@/domain/format';
import { catalogReadyNotice, downloadProgress, searchStatus } from '@/domain/searchStatus';
import { radius, space, touch } from '@/theme/layout';
import { durations } from '@/theme/motion';
import { useTheme } from '@/theme/useTheme';

/**
 * "Cerca un alimento": a ogni lettera cerca nel catalogo sul telefono, anche offline. Pasto e
 * giorno, se arrivano da "Aggiungi" in Oggi, passano alla scheda per la voce del diario.
 * Con `ricetta=1` si scelgono gli ingredienti di una ricetta (RF-20): la ricetta in modifica e
 * quelle che la contengono non si offrono, per non chiudere un giro.
 */
export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { slot, date, plan, ricetta } = useLocalSearchParams<{
    slot?: string;
    date?: string;
    plan?: string;
    ricetta?: string;
  }>();
  const db: SqlDatabase = useSQLiteContext();
  const { info, syncing, progress, refresh } = useCatalog();
  const [query, setQuery] = useState('');
  // I risultati restano legati alla ricerca che li ha prodotti.
  const [results, setResults] = useState<{ query: string; hits: FoodHit[] } | null>(null);
  const latest = useRef(0);
  const retried = useRef(false);
  const catalogSize = info?.foodCount;
  const { session } = useSession();
  const userId = session?.user.id;
  // Con il campo vuoto: preferiti e recenti, per registrare senza scrivere (RF-44).
  const [focusCount, setFocusCount] = useState(0);
  const focusedOnce = useRef(false);
  const [quick, setQuick] = useState<{ favorites: QuickFood[]; recent: RecentFood[] }>({
    favorites: [],
    recent: [],
  });

  // Pasti salvati (RF-31): solo arrivando da un pasto di Oggi, cioè con `slot`; non dal piano
  // né dalla scelta di un ingrediente, dove registrerebbero nel diario voci non volute.
  const canLogMeals = slot !== undefined && !plan && !ricetta;
  const [savedMeals, setSavedMeals] = useState<SavedMealSummary[]>([]);
  const [openMeal, setOpenMeal] = useState<{
    meal: SavedMealSummary;
    items: SavedMealItem[];
    mealName: string;
    // Valori per 100 degli alimenti, per l'anteprima dei macro nel foglio dei grammi.
    values: Record<string, Record<string, number>>;
  } | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [editingItem, setEditingItem] = useState<SavedMealItem | null>(null);
  const [logging, setLogging] = useState(false);
  const loggingNow = useRef(false);
  const opening = useRef(false);

  // Ricette da non offrire come ingredienti: quella in modifica e chi la contiene.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const recipeId = ricetta ? getDraft().recipeId : null;
    if (recipeId === null) return undefined;
    let current = true;
    void recipesContaining(db, recipeId)
      .then((ids) => {
        if (current) setExcluded(new Set([recipeId, ...ids]));
      })
      .catch((error: unknown) => console.error('Ricette annidate non lette', error));
    return () => {
      current = false;
    };
  }, [db, ricetta]);
  const hits = useMemo(
    () => (results?.hits ?? []).filter((hit) => !excluded.has(hit.id)),
    [results, excluded],
  );

  useFocusEffect(
    useCallback(() => {
      // Al primo focus la ricerca è appena partita: si ripete solo tornando alla schermata.
      if (focusedOnce.current) setFocusCount((count) => count + 1);
      focusedOnce.current = true;
      if (userId === undefined) return undefined;
      let current = true;
      void Promise.all([
        loadFavorites(db, userId),
        recentFoods(db, userId, 10),
        canLogMeals ? loadSavedMeals(db, userId) : Promise.resolve([]),
      ])
        .then(([favorites, recent, meals]) => {
          if (!current) return;
          setQuick({ favorites, recent });
          setSavedMeals(meals);
        })
        .catch((error: unknown) => console.error('Recenti non letti', error));
      return () => {
        current = false;
      };
    }, [db, userId, canLogMeals]),
  );

  // Il foglio "Registra «nome»": le voci del pasto salvato e il nome del pasto di Oggi.
  async function openSavedMeal(meal: SavedMealSummary) {
    if (userId === undefined || slot === undefined || opening.current) return;
    opening.current = true;
    try {
      const [items, slots] = await Promise.all([
        savedMealItems(db, userId, meal.id),
        ensureMealSlots(db, userId, new Date()),
      ]);
      const mealName = slots.find((candidate) => candidate.id === slot)?.name;
      if (mealName === undefined) {
        Alert.alert('Pasto non trovato', 'Il pasto di Oggi non c’è più. Torna indietro e riprova.');
        return;
      }
      const { values } = await ingredientValues(
        db,
        items.map((item) => item.foodId),
      );
      setQuantities({});
      setEditingItem(null);
      setOpenMeal({ meal, items, mealName, values });
    } catch (error: unknown) {
      console.error('Pasto salvato non letto', error);
      Alert.alert('Pasto non aperto', 'Il telefono non è riuscito a leggerlo. Riprova.');
    } finally {
      opening.current = false;
    }
  }

  async function logMeal() {
    if (userId === undefined || slot === undefined || openMeal === null || loggingNow.current) {
      return;
    }
    loggingNow.current = true;
    setLogging(true);
    try {
      const logged = await logSavedMeal(db, {
        userId,
        savedMealId: openMeal.meal.id,
        date: date ?? toLocalDate(new Date()),
        mealSlotId: slot,
        quantities,
        now: new Date(),
      });
      const skipped = openMeal.items.length - logged;
      if (skipped > 0) {
        Alert.alert(
          'Pasto registrato',
          skipped === 1
            ? '1 alimento non c’è più e non è stato registrato.'
            : `${skipped} alimenti non ci sono più e non sono stati registrati.`,
        );
      }
      setOpenMeal(null);
      router.dismissTo('/');
    } catch (error: unknown) {
      console.error('Pasto salvato non registrato', error);
      Alert.alert(
        'Pasto non registrato',
        error instanceof Error && error.message.startsWith('Pasto non trovato')
          ? 'Il pasto di Oggi non c’è più. Torna indietro e riprova.'
          : 'Il telefono non è riuscito a registrarlo. Riprova.',
      );
    } finally {
      loggingNow.current = false;
      setLogging(false);
    }
  }

  // Un prodotto che non c'è si crea dalla ricerca, con il nome già scritto (RF-18).
  const create = () =>
    router.push({
      pathname: '/nuovo-alimento',
      params: {
        name: query.trim(),
        from: 'cerca',
        ...(slot ? { slot } : {}),
        ...(date ? { date } : {}),
        ...(plan ? { plan } : {}),
        ...(ricetta ? { ricetta } : {}),
      },
    });

  const open = (id: string) =>
    router.push({
      pathname: '/alimento/[id]',
      params: {
        id,
        ...(slot ? { slot } : {}),
        ...(date ? { date } : {}),
        ...(plan ? { plan } : {}),
        ...(ricetta ? { ricetta } : {}),
      },
    });
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
    searchFoods(db, query, userId ?? null)
      .then((hits) => {
        // Solo l'ultima ricerca conta: una più lenta, arrivata dopo, non copre la nuova.
        if (request === latest.current) setResults({ query, hits });
      })
      .catch((error: unknown) => console.error('Ricerca non riuscita', error));
    // catalogVersion: se arriva un catalogo mentre la schermata è aperta, si cerca di nuovo,
    // così i risultati della ricerca già scritta compaiono da soli.
    // focusCount: tornando dalla scheda o dal form un alimento nuovo, cambiato o eliminato
    // si vede subito.
  }, [db, query, catalogVersion, userId, focusCount]);

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

  const footer =
    status?.kind === 'downloading' && status.message ? (
      <Download headline={status.message} {...downloadProgress(progress)} />
    ) : status?.kind === 'hint' &&
      (quick.favorites.length > 0 ||
        quick.recent.length > 0 ||
        (canLogMeals && savedMeals.length > 0)) ? (
      <View style={styles.quick}>
        {canLogMeals && savedMeals.length > 0 ? (
          <View>
            <TaraText variant="bodyStrong" accessibilityRole="header" style={styles.quickTitle}>
              Pasti salvati
            </TaraText>
            {savedMeals.map((meal) => (
              <PressableScale
                key={`m-${meal.id}`}
                onPress={() => void openSavedMeal(meal)}
                accessibilityLabel={`${meal.name}, pasto salvato, ${foodCountLabel(meal.itemCount)}`}
                style={styles.mealRow}
              >
                <TaraText numberOfLines={1} style={styles.mealName}>
                  {meal.name}
                </TaraText>
                <TaraText variant="caption" color="textSecondary">
                  {foodCountLabel(meal.itemCount)}
                </TaraText>
                <Icon name="chevronRight" color="textSecondary" />
              </PressableScale>
            ))}
          </View>
        ) : null}
        {quick.favorites.length > 0 ? (
          <View>
            <TaraText variant="bodyStrong" accessibilityRole="header" style={styles.quickTitle}>
              Preferiti
            </TaraText>
            {quick.favorites
              .filter((food) => !excluded.has(food.foodId))
              .map((food) => (
                <QuickRow
                  key={`p-${food.foodId}`}
                  name={food.foodName}
                  state={food.foodState}
                  onPress={() => open(food.foodId)}
                />
              ))}
          </View>
        ) : null}
        {quick.recent.length > 0 ? (
          <View>
            <TaraText variant="bodyStrong" accessibilityRole="header" style={styles.quickTitle}>
              Recenti
            </TaraText>
            {quick.recent
              .filter((food) => !excluded.has(food.foodId))
              .map((food) => (
                <QuickRow
                  key={`r-${food.foodId}`}
                  name={food.foodName}
                  state={food.foodState}
                  detail={`ultima volta ${formatAmount(food.lastQuantity, 'grams')} ${food.unit}`}
                  onPress={() => open(food.foodId)}
                />
              ))}
          </View>
        ) : null}
      </View>
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
    ) : null;

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
            brand={item.brand}
            kcalPer100={item.per100.energy_kcal}
            proteinPer100={item.per100.protein_g}
            onPress={() => open(item.id)}
          />
        )}
        ListFooterComponent={
          <>
            {footer}
            {/* Anche senza il catalogo condiviso: gli alimenti personali non lo richiedono. */}
            {status !== null && status.kind !== 'hint' && status.kind !== 'pending' ? (
              <View style={styles.createAfter}>
                <CreateRow query={query} onPress={create} />
              </View>
            ) : null}
          </>
        }
      />
      <Modal
        visible={openMeal !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => (editingItem ? setEditingItem(null) : setOpenMeal(null))}
      >
        {openMeal ? (
          <>
            <SavedMealSheet
              name={openMeal.meal.name}
              mealName={openMeal.mealName}
              items={openMeal.items}
              quantities={quantities}
              busy={logging}
              onEditItem={setEditingItem}
              onConfirm={() => void logMeal()}
              onClose={() => setOpenMeal(null)}
            />
            {editingItem ? (
              <GramSheet
                visible
                food={{
                  name: editingItem.foodName,
                  state: editingItem.foodState,
                  per100: openMeal.values[editingItem.foodId] ?? {},
                }}
                mealName={openMeal.mealName}
                startGrams={quantities[editingItem.id] ?? editingItem.quantity}
                unit={editingItem.unit}
                confirmVerb="Salva"
                onConfirm={(grams) => {
                  setQuantities((current) => ({ ...current, [editingItem.id]: grams }));
                  setEditingItem(null);
                }}
                onClose={() => setEditingItem(null)}
              />
            ) : null}
          </>
        ) : null}
      </Modal>
    </View>
  );
}

/** In fondo ai risultati: il prodotto che non c'è si crea con il nome già scritto. */
function CreateRow({ query, onPress }: { query: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      testID="crea-alimento"
      style={[styles.create, { borderColor: colors.borderStrong }]}
    >
      <Icon name="plus" color="text" size={20} />
      <TaraText variant="bodyStrong" numberOfLines={1} style={styles.createText}>
        Crea «{query.trim()}»
      </TaraText>
    </PressableScale>
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
  createAfter: { padding: space.l },
  create: {
    minHeight: touch.min,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    paddingHorizontal: space.l,
    borderRadius: radius.button,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  createText: { flexShrink: 1 },
  quick: { gap: space.l, paddingBottom: space.xl },
  mealRow: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: space.l,
  },
  mealName: { flex: 1 },
  quickTitle: { paddingHorizontal: space.l, paddingBottom: space.xs },
  retry: {
    minHeight: touch.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
