import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GramSheet } from '@/components/GramSheet';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { NutritionLabel } from '@/components/NutritionLabel';
import { PressableScale } from '@/components/PressableScale';
import { Segmented } from '@/components/Segmented';
import { StateTag } from '@/components/StateTag';
import { TaraText } from '@/components/TaraText';
import { TextField } from '@/components/TextField';
import { type FoodDetail, getFood, getVariant } from '@/data/catalogStore';
import { addEntry, ensureMealSlots, lastQuantity, type MealSlot } from '@/data/diaryStore';
import { addItem as addRecipeItem, getDraft } from '@/data/recipeDraft';
import {
  duplicateRecipe,
  type RecipeDetail,
  recipeDetail,
  updateRecipe,
} from '@/data/recipesStore';
import { addPlanItem } from '@/data/planStore';
import { isFavorite, setFavorite } from '@/data/quickStore';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import { minutesOfDay, slotForTime, toLocalDate } from '@/domain/diary';
import { parseLabelValue } from '@/domain/foodForm';
import { formatAmount, formatTime } from '@/domain/format';
import { portionShortcuts } from '@/domain/recipe';
import { sourceLabel } from '@/domain/sources';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

/**
 * Scheda alimento: etichetta per 100 g con la fonte, il pasto a cui va e il foglio dei
 * grammi (RF-41). Pasto e giorno arrivano da "Aggiungi" in Oggi; dalla barra di ricerca il
 * giorno è oggi e il pasto quello con l'orario più vicino, sempre modificabile.
 * L'intestazione nativa è nascosta perché il foglio copra tutta la schermata.
 */
export default function FoodScreen() {
  // plan: id del tipo di giornata quando si aggiunge al piano invece che al diario (RF-130).
  // ricetta: si sta scegliendo un ingrediente per la ricetta in modifica (RF-20).
  const params = useLocalSearchParams<{
    id: string;
    slot?: string;
    date?: string;
    plan?: string;
    ricetta?: string;
  }>();
  const { id } = params;
  const db: SqlDatabase = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;
  // undefined: si sta leggendo; null: l'alimento non c'è.
  const [food, setFood] = useState<FoodDetail | null | undefined>(undefined);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [slots, setSlots] = useState<MealSlot[]>([]);
  const [slotId, setSlotId] = useState<string | undefined>(params.slot);
  // L'ultima quantità vale solo per l'alimento e il pasto per cui è stata letta: cambiando
  // pasto, finché non arriva la nuova, la scorciatoia non compare.
  const [last, setLast] = useState<{ key: string; grams: number | null } | null>(null);
  const lastKey = `${id}:${slotId ?? ''}`;
  const lastGrams = last?.key === lastKey ? last.grams : null;
  const [sheetOpen, setSheetOpen] = useState(false);
  // Solo per una ricetta: ingredienti e resa, riletti dopo ogni aggiornamento del peso.
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [cookedText, setCookedText] = useState('');
  const [cookedInvalid, setCookedInvalid] = useState(false);
  const [favorite, setFavoriteState] = useState(false);
  // Dopo un tocco sulla stella la lettura iniziale, se arriva tardi, non la riporta indietro.
  const starTouched = useRef(false);
  // Una sola scrittura alla volta: un doppio tocco su "Aggiungi" non registra due voci.
  const saving = useRef(false);
  const date = params.date ?? toLocalDate(new Date());

  const load = useCallback(
    async (isCurrent: () => boolean) => {
      const found = await getFood(db, id);
      const other =
        // La variante sta nel catalogo condiviso: per un alimento personale porterebbe a
        // un generico con lo stesso nome, non a un prodotto dell'utente.
        found && !found.personal && found.state !== 'not_applicable'
          ? await getVariant(db, found.name, found.state === 'raw' ? 'cooked' : 'raw')
          : null;
      const detail =
        found?.source === 'recipe' && userId !== undefined
          ? await recipeDetail(db, userId, id)
          : null;
      if (!isCurrent()) return;
      setFood(found);
      setVariantId(other);
      setRecipe(detail);
      if (detail?.yield.mode === 'weight') {
        setCookedText(String(detail.yield.cookedWeightG).replace('.', ','));
      }
    },
    [db, id, userId],
  );

  // Alla scheda si torna anche dal form di modifica: si rilegge a ogni ritorno.
  useFocusEffect(
    useCallback(() => {
      let current = true;
      void load(() => current);
      return () => {
        current = false;
      };
    }, [load]),
  );

  useEffect(() => {
    if (userId === undefined) return undefined;
    let current = true;
    void (async () => {
      const mealSlots = await ensureMealSlots(db, userId, new Date());
      if (!current) return;
      setSlots(mealSlots);
      setSlotId(
        (chosen) => chosen ?? slotForTime(mealSlots, minutesOfDay(formatTime(new Date())))?.id,
      );
    })();
    return () => {
      current = false;
    };
  }, [db, userId]);

  useEffect(() => {
    if (userId === undefined) return undefined;
    let current = true;
    starTouched.current = false;
    void isFavorite(db, userId, id)
      .then((value) => {
        if (current && !starTouched.current) setFavoriteState(value);
      })
      .catch((error: unknown) => console.error('Preferito non letto', error));
    return () => {
      current = false;
    };
  }, [db, userId, id]);

  // "Ultima volta a pranzo: 300 g" (RF-42): dipende da alimento e pasto.
  useEffect(() => {
    if (userId === undefined || slotId === undefined) return undefined;
    let current = true;
    const key = `${id}:${slotId}`;
    void lastQuantity(db, userId, id, slotId).then((grams) => {
      if (current) setLast({ key, grams });
    });
    return () => {
      current = false;
    };
  }, [db, userId, id, slotId]);

  const back = (
    <PressableScale onPress={() => router.back()} accessibilityLabel="Indietro" style={styles.back}>
      <Icon name="chevronLeft" color="text" />
    </PressableScale>
  );
  const screenStyle = [
    styles.screen,
    { backgroundColor: colors.background, paddingTop: insets.top },
  ];

  if (food === undefined) return <View style={screenStyle} />;
  if (food === null) {
    return (
      <View style={screenStyle}>
        {back}
        <View style={styles.missing}>
          <TaraText variant="section">Alimento non trovato</TaraText>
          <PressableScale
            onPress={() => router.back()}
            style={[styles.secondary, { borderColor: colors.borderStrong }]}
          >
            <TaraText variant="bodyStrong">Torna alla ricerca</TaraText>
          </PressableScale>
        </View>
      </View>
    );
  }

  const per100 = Object.fromEntries(food.nutrients.map((n) => [n.code, n.amountPer100]));
  const source = sourceLabel(food.source);
  const slot = slots.find((candidate) => candidate.id === slotId);

  // Ingrediente di una ricetta: va nella bozza in memoria, non nel database.
  function addToRecipe(quantity: number) {
    if (!food || saving.current) return;
    saving.current = true;
    addRecipeItem({ id: food.id, name: food.name, state: food.state }, quantity);
    setSheetOpen(false);
    // Tornando al editor i parametri si sostituiscono: senza `id` una ricetta in modifica
    // si presenterebbe come nuova.
    const recipeId = getDraft().recipeId;
    router.dismissTo(recipeId ? { pathname: '/ricetta', params: { id: recipeId } } : '/ricetta');
  }

  // RF-23: il peso da cotto di oggi; le voci già registrate restano come erano.
  async function updateCookedWeight() {
    if (userId === undefined || !recipe || saving.current) return;
    const grams = parseLabelValue(cookedText);
    if (grams === null || grams === undefined || grams <= 0) {
      setCookedInvalid(true);
      return;
    }
    setCookedInvalid(false);
    saving.current = true;
    try {
      await updateRecipe(
        db,
        userId,
        recipe.id,
        {
          name: recipe.name,
          yield: { mode: 'weight', cookedWeightG: grams },
          items: recipe.items.map((item) => ({ foodId: item.foodId, gramsRaw: item.gramsRaw })),
        },
        new Date(),
      );
      await load(() => true);
    } catch (error: unknown) {
      console.error('Peso non aggiornato', error);
      Alert.alert('Peso non aggiornato', 'Il telefono non è riuscito a salvarlo. Riprova.');
    } finally {
      saving.current = false;
    }
  }

  async function duplicate() {
    if (userId === undefined || !recipe || saving.current) return;
    saving.current = true;
    try {
      const copy = await duplicateRecipe(db, userId, recipe.id, new Date());
      if (copy !== null) router.push({ pathname: '/ricetta', params: { id: copy } });
    } catch (error: unknown) {
      console.error('Ricetta non duplicata', error);
      Alert.alert('Ricetta non duplicata', 'Il telefono non è riuscito a copiarla. Riprova.');
    } finally {
      saving.current = false;
    }
  }

  async function add(quantity: number, andContinue: boolean) {
    if (userId === undefined || slot === undefined || !food || saving.current) return;
    saving.current = true;
    try {
      if (params.plan) {
        await addPlanItem(db, {
          userId,
          dayTypeId: params.plan,
          mealSlotId: slot.id,
          food,
          quantity,
          now: new Date(),
        });
      } else {
        await addEntry(db, { userId, date, mealSlotId: slot.id, food, quantity, now: new Date() });
      }
    } catch (error: unknown) {
      saving.current = false;
      console.error('Voce non salvata', error);
      Alert.alert('Voce non salvata', 'Il telefono non è riuscito a salvarla. Riprova.');
      return;
    }
    setSheetOpen(false);
    // "Aggiungi e continua" torna ai risultati per il prossimo alimento dello stesso pasto,
    // con pasto e giorno scelti qui; altrimenti si torna a Oggi, dove la voce compare.
    // Dal piano si torna al Piano, dal diario a Oggi.
    if (andContinue) {
      router.dismissTo({
        pathname: '/cerca',
        params: params.plan ? { slot: slot.id, plan: params.plan } : { slot: slot.id, date },
      });
    } else router.dismissTo(params.plan ? '/piano' : '/');
  }

  return (
    <View style={screenStyle}>
      {/* Con il foglio aperto la scheda dietro non esiste per il lettore dello schermo:
          su Android accessibilityViewIsModal del foglio non basta. */}
      <View
        style={styles.body}
        importantForAccessibility={sheetOpen ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={sheetOpen}
      >
        <View style={styles.topBar}>
          {back}
          <View style={styles.topActions}>
            {food.source === 'recipe' ? (
              <PressableScale
                onPress={() => router.push({ pathname: '/ricetta', params: { id: food.id } })}
                accessibilityLabel="Modifica ricetta"
                testID="modifica-ricetta"
                style={styles.edit}
              >
                <TaraText variant="bodyStrong">Modifica</TaraText>
              </PressableScale>
            ) : food.personal ? (
              <PressableScale
                onPress={() =>
                  router.push({ pathname: '/nuovo-alimento', params: { id: food.id } })
                }
                accessibilityLabel="Modifica alimento"
                style={styles.edit}
              >
                <TaraText variant="bodyStrong">Modifica</TaraText>
              </PressableScale>
            ) : null}
            <PressableScale
              onPress={() => {
                if (userId === undefined) return;
                const next = !favorite;
                starTouched.current = true;
                setFavoriteState(next);
                void setFavorite(db, userId, food, next, new Date()).catch((error: unknown) => {
                  console.error('Preferito non salvato', error);
                  setFavoriteState(!next);
                });
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: favorite }}
              accessibilityLabel="Preferito"
              style={styles.back}
            >
              <Icon name="star" color="text" filled={favorite} />
            </PressableScale>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heading}>
            <View style={styles.title}>
              <TaraText variant="title">{food.name}</TaraText>
              <StateTag state={food.state} />
            </View>
            {food.brand !== null || food.cooking !== null ? (
              <TaraText variant="caption" color="textSecondary">
                {[food.brand, food.cooking].filter((text) => text !== null).join(' · ')}
              </TaraText>
            ) : null}
          </View>
          {recipe ? (
            <View style={styles.ingredients} testID="ingredienti-ricetta">
              <TaraText variant="bodyStrong" accessibilityRole="header">
                Ingredienti
              </TaraText>
              {recipe.items.map((item) => (
                <View key={item.id} style={styles.ingredient}>
                  <TaraText style={styles.ingredientName} numberOfLines={2}>
                    {item.foodName}
                  </TaraText>
                  <TaraText variant="bodyStrong">{formatAmount(item.gramsRaw, 'grams')} g</TaraText>
                </View>
              ))}
              <TaraText variant="caption" color="textSecondary">
                Grammi a crudo
              </TaraText>
            </View>
          ) : null}
          {recipe?.servingG ? (
            <NutritionLabel title="Per porzione" per100={per100} grams={recipe.servingG} />
          ) : null}
          <NutritionLabel
            title={recipe ? 'Per 100 g' : undefined}
            per100={per100}
            grams={100}
            unit={food.baseUnit}
          />
          {recipe?.yield.mode === 'weight' ? (
            <View style={styles.cooked}>
              <TextField
                label="Peso da cotto di oggi (g)"
                value={cookedText}
                onChangeText={setCookedText}
                keyboardType="decimal-pad"
                invalid={cookedInvalid}
                testID="campo-peso-oggi"
              />
              {cookedInvalid ? (
                <TaraText variant="caption" color="error">
                  Scrivi il peso da cotto in grammi, maggiore di zero.
                </TaraText>
              ) : null}
              <Button
                label="Aggiorna il peso"
                kind="secondary"
                onPress={() => void updateCookedWeight()}
                testID="aggiorna-peso"
              />
            </View>
          ) : null}
          {recipe ? (
            <Button
              label="Duplica"
              kind="secondary"
              onPress={() => void duplicate()}
              testID="duplica-ricetta"
            />
          ) : null}
          {source !== null ? (
            <TaraText variant="caption" color="textSecondary">
              Fonte: {source}
            </TaraText>
          ) : null}
        </ScrollView>
        <View style={[styles.actions, { paddingBottom: space.l + insets.bottom }]}>
          {params.ricetta ? null : (
            <Segmented
              label="Pasto"
              options={slots.map((candidate) => ({ key: candidate.id, label: candidate.name }))}
              selectedKey={slotId}
              onSelect={setSlotId}
            />
          )}
          <PressableScale
            onPress={() => setSheetOpen(true)}
            disabled={slot === undefined && !params.ricetta}
            testID="aggiungi-alimento"
            style={[styles.primary, { backgroundColor: colors.action }]}
          >
            <TaraText variant="bodyStrong" color="background">
              {params.ricetta
                ? 'Aggiungi alla ricetta'
                : slot
                  ? params.plan
                    ? `Aggiungi al piano: ${slot.name}`
                    : `Aggiungi a ${slot.name}`
                  : 'Aggiungi'}
            </TaraText>
          </PressableScale>
        </View>
      </View>

      <GramSheet
        visible={sheetOpen}
        food={{ name: food.name, state: food.state, per100 }}
        mealName={params.ricetta ? undefined : slot?.name}
        lastGrams={params.ricetta ? undefined : (lastGrams ?? undefined)}
        confirmVerb="Aggiungi"
        unit={food.baseUnit}
        shortcuts={recipe?.servingG ? portionShortcuts(recipe.servingG) : undefined}
        onConfirm={(quantity) =>
          params.ricetta ? addToRecipe(quantity) : void add(quantity, false)
        }
        onConfirmAndContinue={params.ricetta ? undefined : (quantity) => void add(quantity, true)}
        onClose={() => setSheetOpen(false)}
        onChangeState={
          variantId === null
            ? undefined
            : (state) => {
                if (state === food.state) return;
                // Le coppie sono uniche (getVariant): la variante della variante è l'alimento
                // di partenza, già noto prima che la nuova scheda finisca di caricarsi.
                setVariantId(food.id);
                router.setParams({ id: variantId });
              }
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  back: {
    width: touch.min,
    height: touch.min,
    marginLeft: space.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', marginRight: space.s },
  topActions: { flexDirection: 'row', alignItems: 'center' },
  edit: { minHeight: touch.min, paddingHorizontal: space.m, justifyContent: 'center' },
  content: { padding: space.l, gap: space.l },
  ingredients: { gap: space.xs },
  ingredient: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.m,
  },
  ingredientName: { flex: 1 },
  cooked: { gap: space.s },
  heading: { gap: space.xs },
  title: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.s },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.l },
  secondary: {
    minHeight: touch.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space.l,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  actions: { paddingHorizontal: space.l, paddingTop: space.m, gap: space.m },
  primary: {
    minHeight: touch.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
