import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GramSheet } from '@/components/GramSheet';
import { Icon } from '@/components/Icon';
import { NutritionLabel } from '@/components/NutritionLabel';
import { PressableScale } from '@/components/PressableScale';
import { StateTag } from '@/components/StateTag';
import { TaraText } from '@/components/TaraText';
import { type FoodDetail, getFood, getVariant } from '@/data/catalogStore';
import { addEntry, ensureMealSlots, lastQuantity, type MealSlot } from '@/data/diaryStore';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import { minutesOfDay, slotForTime, toLocalDate } from '@/domain/diary';
import { formatTime } from '@/domain/format';
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
  const params = useLocalSearchParams<{ id: string; slot?: string; date?: string }>();
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
  const [lastGrams, setLastGrams] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const date = params.date ?? toLocalDate(new Date());

  useEffect(() => {
    let current = true;
    void (async () => {
      const found = await getFood(db, id);
      const other =
        found && found.state !== 'not_applicable'
          ? await getVariant(db, found.name, found.state === 'raw' ? 'cooked' : 'raw')
          : null;
      if (current) {
        setFood(found);
        setVariantId(other);
      }
    })();
    return () => {
      current = false;
    };
  }, [db, id]);

  useEffect(() => {
    if (userId === undefined) return undefined;
    let current = true;
    void (async () => {
      const mealSlots = await ensureMealSlots(db, userId, new Date());
      if (!current) return;
      setSlots(mealSlots);
      setSlotId(
        (chosen) =>
          chosen ?? slotForTime(mealSlots, minutesOfDay(formatTime(new Date())))?.id,
      );
    })();
    return () => {
      current = false;
    };
  }, [db, userId]);

  // "Ultima volta a pranzo: 300 g" (RF-42): dipende da alimento e pasto.
  useEffect(() => {
    if (userId === undefined || slotId === undefined) return undefined;
    let current = true;
    void lastQuantity(db, userId, id, slotId).then((grams) => {
      if (current) setLastGrams(grams);
    });
    return () => {
      current = false;
    };
  }, [db, userId, id, slotId]);

  const back = (
    <PressableScale
      onPress={() => router.back()}
      accessibilityLabel="Indietro"
      style={styles.back}
    >
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

  async function add(quantity: number, andContinue: boolean) {
    if (userId === undefined || slot === undefined || !food) return;
    await addEntry(db, { userId, date, mealSlotId: slot.id, food, quantity, now: new Date() });
    setSheetOpen(false);
    // "Aggiungi e continua" torna ai risultati per il prossimo alimento dello stesso pasto;
    // altrimenti si torna a Oggi, dove la voce compare.
    if (andContinue) router.back();
    else router.dismissTo('/');
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
        {back}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heading}>
            <View style={styles.title}>
              <TaraText variant="title">{food.name}</TaraText>
              <StateTag state={food.state} />
            </View>
            {food.cooking !== null ? (
              <TaraText variant="caption" color="textSecondary">
                {food.cooking}
              </TaraText>
            ) : null}
          </View>
          <NutritionLabel per100={per100} grams={100} />
          {source !== null ? (
            <TaraText variant="caption" color="textSecondary">
              Fonte: {source}
            </TaraText>
          ) : null}
        </ScrollView>
        <View style={[styles.actions, { paddingBottom: space.l + insets.bottom }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityRole="radiogroup"
            accessibilityLabel="Pasto"
            contentContainerStyle={styles.slots}
          >
            {slots.map((candidate) => {
              const selected = candidate.id === slotId;
              return (
                <PressableScale
                  key={candidate.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setSlotId(candidate.id)}
                  style={[
                    styles.slot,
                    selected
                      ? { backgroundColor: colors.text, borderColor: colors.text }
                      : { borderColor: colors.borderStrong },
                  ]}
                >
                  <TaraText variant="bodyStrong" color={selected ? 'background' : 'textSecondary'}>
                    {candidate.name}
                  </TaraText>
                </PressableScale>
              );
            })}
          </ScrollView>
          <PressableScale
            onPress={() => setSheetOpen(true)}
            disabled={slot === undefined}
            style={[styles.primary, { backgroundColor: colors.action }]}
          >
            <TaraText variant="bodyStrong" color="background">
              {slot ? `Aggiungi a ${slot.name}` : 'Aggiungi'}
            </TaraText>
          </PressableScale>
        </View>
      </View>

      <GramSheet
        visible={sheetOpen}
        food={{ name: food.name, state: food.state, per100 }}
        mealName={slot?.name}
        lastGrams={lastGrams ?? undefined}
        confirmVerb="Aggiungi"
        onConfirm={(quantity) => void add(quantity, false)}
        onConfirmAndContinue={(quantity) => void add(quantity, true)}
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
  content: { padding: space.l, gap: space.l },
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
  slots: { gap: space.s },
  slot: {
    minHeight: touch.min,
    borderRadius: radius.field,
    borderWidth: 1,
    paddingHorizontal: space.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    minHeight: touch.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
