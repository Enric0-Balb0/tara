import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { type ComponentRef, useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, ScrollView, StyleSheet, View } from 'react-native';

import { DayGoals } from '@/components/DayGoals';
import { DayTypeCard } from '@/components/DayTypeCard';
import { WaterIncrements } from '@/components/WaterIncrements';
import { DiaryRow } from '@/components/DiaryRow';
import { GramSheet } from '@/components/GramSheet';
import { Icon } from '@/components/Icon';
import { MealSection } from '@/components/MealSection';
import { PressableScale } from '@/components/PressableScale';
import { Segmented } from '@/components/Segmented';
import { TaraText } from '@/components/TaraText';
import { ensureMealSlots, type MealSlot } from '@/data/diaryStore';
import { deletePlanItem, type PlanItem, planFor, updatePlanQuantity } from '@/data/planStore';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import {
  addDayType,
  type DayTarget,
  type DayType,
  deleteDayType,
  ensureDayTypes,
  renameDayType,
  setTarget,
  targetOn,
} from '@/data/targetsStore';
import {
  setWaterIncrements,
  setWaterTarget,
  waterIncrements,
  waterTarget,
} from '@/data/waterStore';
import { entryAmount, toLocalDate, totals } from '@/domain/diary';
import type { MacroTargets } from '@/domain/targets';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

interface Loaded {
  types: DayType[];
  targets: Record<string, DayTarget | undefined>;
  waters: Record<string, number | null>;
  increments: number[];
  slots: MealSlot[];
  plan: PlanItem[];
}

/**
 * Piano (RF-50, RF-53, RF-130): per il tipo di giornata scelto, i target e i pasti con alimenti
 * e grammi; il totale del piano si confronta con i target. Un target cambiato vale da oggi: i
 * giorni passati restano confrontati con il loro. In Oggi il piano diventa voci previste.
 */
export default function PlanScreen() {
  const db: SqlDatabase = useSQLiteContext();
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user.id;
  const { colors } = useTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  // In un ref per load: come dipendenza farebbe rileggere tutto a ogni cambio di tipo.
  const selected = useRef<string | undefined>(undefined);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const latest = useRef(0);
  // La schermata sta sotto l'intestazione delle tab: KeyboardAvoidingView ha bisogno di sapere
  // a che altezza della finestra comincia, altrimenti calcola male quanto copre la tastiera.
  const frame = useRef<ComponentRef<typeof View>>(null);
  const [top, setTop] = useState(0);

  const load = useCallback(
    async (wanted?: string) => {
      if (userId === undefined) return;
      const request = ++latest.current;
      const today = toLocalDate(new Date());
      try {
        const [types, slots] = await Promise.all([
          ensureDayTypes(db, userId, new Date()),
          ensureMealSlots(db, userId, new Date()),
        ]);
        const targets: Loaded['targets'] = {};
        const waters: Loaded['waters'] = {};
        for (const type of types) {
          targets[type.id] = await targetOn(db, userId, type.id, today);
          waters[type.id] = await waterTarget(db, userId, type.id);
        }
        const increments = await waterIncrements(db, userId);
        const chosen = types.find((type) => type.id === (wanted ?? selected.current)) ?? types[0];
        const plan = chosen ? await planFor(db, userId, chosen.id) : [];
        if (request !== latest.current) return;
        setLoaded({ types, targets, waters, increments, slots, plan });
        selected.current = chosen?.id;
        setSelectedId(chosen?.id);
      } catch (error: unknown) {
        console.error('Piano non letto', error);
      }
    },
    [db, userId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function save(type: DayType, name: string, values: MacroTargets, water: number | null) {
    if (userId === undefined) return;
    const now = new Date();
    const current = loaded?.targets[type.id];
    // Un target nuovo solo se i valori cambiano: rinominare non aggiunge storia (RF-53).
    const changed = current
      ? (['kcal', 'protein_g', 'carbs_g', 'fat_g'] as const).some(
          (key) => values[key] !== current[key],
        )
      : Object.values(values).some((value) => value !== null);
    try {
      // Tutto o niente: nome, target e acqua della scheda si salvano insieme.
      await db.withTransactionAsync(async () => {
        if (name !== type.name) await renameDayType(db, userId, type.id, name, now);
        if (changed) await setTarget(db, userId, type.id, toLocalDate(now), values, now);
        // L'acqua non ha storia: vale il valore di adesso (RF-61).
        if (water !== (loaded?.waters[type.id] ?? null)) {
          await setWaterTarget(db, userId, type.id, water, now);
        }
      });
    } catch (error: unknown) {
      console.error('Target non salvato', error);
      Alert.alert('Target non salvato', 'Il telefono non è riuscito a salvarlo. Riprova.');
    } finally {
      // Anche dopo un errore: la scheda mostra com'è davvero salvato.
      await load();
    }
  }

  function remove(type: DayType, types: readonly DayType[]) {
    if (userId === undefined) return;
    // I giorni di questo tipo passano al primo tipo che resta.
    const fallback = types.find((candidate) => candidate.id !== type.id);
    Alert.alert(
      `Eliminare ${type.name}?`,
      fallback
        ? `I giorni segnati come ${type.name} passano a ${fallback.name}, con i suoi target e il suo piano. Le voci del diario restano com'erano.`
        : "Le voci del diario restano com'erano.",
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () =>
            void deleteDayType(db, userId, type.id, new Date())
              .then(() => load(fallback?.id))
              .catch((error: unknown) => console.error('Tipo non eliminato', error)),
        },
      ],
    );
  }

  async function saveIncrements(values: number[]) {
    if (userId === undefined) return;
    try {
      await setWaterIncrements(db, userId, values, new Date());
    } catch (error: unknown) {
      console.error('Incrementi non salvati', error);
      Alert.alert('Incrementi non salvati', 'Il telefono non è riuscito a salvarli. Riprova.');
      return;
    }
    await load();
  }

  async function add() {
    if (userId === undefined) return;
    try {
      const type = await addDayType(db, userId, 'Nuovo tipo', new Date());
      await load(type.id);
    } catch (error: unknown) {
      console.error('Tipo non aggiunto', error);
    }
  }

  // Il foglio si chiude solo a scrittura riuscita; se non riesce lo dice e resta aperto.
  async function write(change: (owner: string) => Promise<void>) {
    if (userId === undefined) return;
    try {
      await change(userId);
    } catch (error: unknown) {
      console.error('Piano non salvato', error);
      Alert.alert('Modifica non salvata', 'Il telefono non è riuscito a salvarla. Riprova.');
      return;
    }
    setEditing(null);
    await load();
  }

  if (loaded === null) return <View style={styles.screen} />;
  const index = Math.max(
    0,
    loaded.types.findIndex((type) => type.id === selectedId),
  );
  const type = loaded.types[index];
  const target = type ? loaded.targets[type.id] : undefined;
  const editingSlot = editing
    ? loaded.slots.find((slot) => slot.id === editing.mealSlotId)
    : undefined;

  return (
    <View
      ref={frame}
      style={styles.screen}
      onLayout={() => frame.current?.measureInWindow((_x, y) => setTop(y))}
    >
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={top} style={styles.screen}>
        <ScrollView
          testID="piano"
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={editing !== null}
        >
          {loaded.types.length > 1 ? (
            <Segmented
              label="Tipo di giornata"
              options={loaded.types.map((candidate) => ({
                key: candidate.id,
                label: candidate.name,
              }))}
              selectedKey={type?.id}
              onSelect={(id) => void load(id)}
            />
          ) : null}

          {type ? (
            <>
              <View style={styles.intro}>
                <TaraText variant="section" accessibilityRole="header">
                  Target di {type.name}
                </TaraText>
                <TaraText variant="caption" color="textSecondary">
                  Un target cambiato vale da oggi: i giorni passati restano con il loro. Un campo
                  vuoto è un target non impostato.
                </TaraText>
              </View>
              <DayTypeCard
                // Rimonta la scheda quando arriva un target diverso, così i campi ripartono da lì.
                key={`${type.id}:${target?.id ?? 'nessuno'}:${target?.validFrom ?? ''}:${type.name}:${loaded.waters[type.id] ?? ''}`}
                testID={`tipo-${index}`}
                name={type.name}
                target={target}
                water={loaded.waters[type.id] ?? null}
                canDelete={loaded.types.length > 1}
                onSave={(name, values, water) => save(type, name, values, water)}
                onDelete={() => remove(type, loaded.types)}
              />

              <View style={styles.intro}>
                <TaraText variant="section" accessibilityRole="header">
                  Piano di {type.name}
                </TaraText>
                <TaraText variant="caption" color="textSecondary">
                  I pasti con alimenti e grammi: in Oggi diventano voci previste da confermare.
                </TaraText>
              </View>
              {loaded.plan.length > 0 ? (
                <View style={styles.intro}>
                  <TaraText variant="bodyStrong">Totale del piano</TaraText>
                  <DayGoals label="Totale del piano" totals={totals(loaded.plan)} target={target} />
                </View>
              ) : null}
              {loaded.slots.map((slot) => {
                const own = loaded.plan.filter((item) => item.mealSlotId === slot.id);
                const sum = totals(own);
                return (
                  <MealSection
                    key={slot.id}
                    name={slot.name}
                    kcal={sum.energy_kcal}
                    protein={sum.protein_g}
                    addLabel={`Aggiungi al piano: ${slot.name}`}
                    onAdd={() =>
                      router.push({ pathname: '/cerca', params: { slot: slot.id, plan: type.id } })
                    }
                    entries={own.map((item) => ({
                      key: item.id,
                      row: (
                        <DiaryRow
                          name={item.foodName}
                          state={item.foodState}
                          quantity={item.quantity}
                          unit={item.unit}
                          kcal={entryAmount(item.snapshot, 'energy_kcal', item.quantity)}
                          protein={entryAmount(item.snapshot, 'protein_g', item.quantity)}
                          onPress={() => setEditing(item)}
                        />
                      ),
                    }))}
                  />
                );
              })}
            </>
          ) : null}

          <WaterIncrements
            // Rimonta quando cambiano i valori salvati, così i campi ripartono da lì.
            key={loaded.increments.join(',')}
            testID="incrementi"
            increments={loaded.increments}
            onSave={saveIncrements}
          />

          <PressableScale
            onPress={() => void add()}
            style={[styles.add, { borderColor: colors.borderStrong }]}
          >
            <Icon name="plus" color="textSecondary" />
            <TaraText variant="bodyStrong" color="textSecondary">
              Aggiungi un tipo di giornata
            </TaraText>
          </PressableScale>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Nel Modal il foglio copre anche ricerca e tab, che stanno fuori dalla schermata. */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setEditing(null)}
      >
        {editing ? (
          <GramSheet
            visible
            food={{
              name: editing.foodName,
              state: editing.foodState,
              per100: Object.fromEntries(
                Object.entries(editing.snapshot).map(([code, value]) => [code, value.amount]),
              ),
            }}
            mealName={editingSlot?.name}
            startGrams={editing.quantity}
            unit={editing.unit}
            confirmVerb="Salva"
            onConfirm={(quantity) =>
              void write((owner) => updatePlanQuantity(db, owner, editing.id, quantity, new Date()))
            }
            onDelete={() =>
              void write((owner) => deletePlanItem(db, owner, editing.id, new Date()))
            }
            onClose={() => setEditing(null)}
          />
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.l, gap: space.l, paddingBottom: space.xxxl },
  intro: { gap: space.xs },
  add: {
    minHeight: touch.primary,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
  },
});
