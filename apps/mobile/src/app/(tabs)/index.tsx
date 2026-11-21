import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, ScrollView, StyleSheet, View } from 'react-native';

import { DayGoals } from '@/components/DayGoals';
import { DiaryRow } from '@/components/DiaryRow';
import { GramSheet } from '@/components/GramSheet';
import { Icon } from '@/components/Icon';
import { MealSection } from '@/components/MealSection';
import { PlannedRow } from '@/components/PlannedRow';
import { PressableScale } from '@/components/PressableScale';
import { Segmented } from '@/components/Segmented';
import { TaraText } from '@/components/TaraText';
import {
  type DiaryEntry,
  deleteEntry,
  ensureMealSlots,
  entriesForDay,
  type MealSlot,
  updateEntryQuantity,
} from '@/data/diaryStore';
import { confirmPlanItem, pendingPlan, type PlanItem, planFor } from '@/data/planStore';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import {
  type DayTarget,
  type DayType,
  dayTypeFor,
  ensureDayTypes,
  keepDayType,
  setDayType,
  targetOn,
} from '@/data/targetsStore';
import {
  addDays,
  dayLabel,
  dayTitle,
  entryAmount,
  mealPlanStatus,
  toLocalDate,
  totals,
} from '@/domain/diary';
import { space, touch } from '@/theme/layout';

/**
 * Oggi (RF-40, RF-45, RF-50, RF-51): tipo di giornata, obiettivi contro il target in vigore
 * quel giorno, e i pasti con le voci registrate. Si scorre tra i giorni con le frecce; un
 * tocco su una voce la modifica o la elimina. Le voci previste dal piano arrivano con RF-130.
 */
export default function TodayScreen() {
  const db: SqlDatabase = useSQLiteContext();
  const { session } = useSession();
  const userId = session?.user.id;
  const router = useRouter();
  const navigation = useNavigation();
  const [today, setToday] = useState(() => toLocalDate(new Date()));
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<MealSlot[]>([]);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [dayTypes, setDayTypes] = useState<DayType[]>([]);
  const [dayTypeId, setDayTypeId] = useState<string | undefined>(undefined);
  const [target, setTarget] = useState<DayTarget | undefined>(undefined);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [pending, setPending] = useState<PlanItem[]>([]);
  // Pasti completi riaperti a mano; gli altri completi restano chiusi in una riga.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<PlanItem | null>(null);
  const latest = useRef(0);

  // Dopo mezzanotte, con l'app rimasta aperta, "oggi" va avanti: chi guardava oggi passa
  // al giorno nuovo, chi guardava un altro giorno resta lì.
  const refreshToday = useCallback(() => {
    const now = toLocalDate(new Date());
    setToday((previous) => {
      if (previous !== now) setDate((shown) => (shown === previous ? now : shown));
      return now;
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshToday();
    });
    return () => subscription.remove();
  }, [refreshToday]);

  const load = useCallback(async () => {
    if (userId === undefined) return;
    // Solo l'ultima lettura conta: con le frecce toccate in fretta una lettura più lenta,
    // arrivata dopo, mostrerebbe le voci di un altro giorno.
    const request = ++latest.current;
    try {
      const [mealSlots, dayEntries, types] = await Promise.all([
        ensureMealSlots(db, userId, new Date()),
        entriesForDay(db, userId, date),
        ensureDayTypes(db, userId, new Date()),
      ]);
      // Un giorno con voci fissa il suo tipo: cambiare i tipi dopo non riscrive il passato.
      if (dayEntries.length > 0) await keepDayType(db, userId, date, new Date());
      const typeId = await dayTypeFor(db, userId, date);
      const dayTarget = typeId ? await targetOn(db, userId, typeId, date) : undefined;
      const dayPlan = typeId ? await planFor(db, userId, typeId) : [];
      const dayPending = typeId ? await pendingPlan(db, userId, date, typeId) : [];
      if (request !== latest.current) return;
      setSlots(mealSlots);
      setEntries(dayEntries);
      setDayTypes(types);
      setDayTypeId(typeId);
      setTarget(dayTarget);
      setPlan(dayPlan);
      setPending(dayPending);
    } catch (error: unknown) {
      console.error('Diario non letto', error);
    }
  }, [db, userId, date]);

  // Si ricarica ogni volta che si torna qui, per esempio dopo aver aggiunto una voce.
  useFocusEffect(
    useCallback(() => {
      refreshToday();
      void load();
    }, [load, refreshToday]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: dayTitle(date, today) });
  }, [navigation, date, today]);

  // Il foglio si chiude solo a scrittura riuscita; se non riesce lo dice e resta aperto.
  async function write(change: (owner: string) => Promise<void>) {
    if (userId === undefined) return;
    try {
      await change(userId);
    } catch (error: unknown) {
      console.error('Diario non salvato', error);
      Alert.alert('Modifica non salvata', 'Il telefono non è riuscito a salvarla. Riprova.');
      return;
    }
    setEditing(null);
    await load();
  }

  function saveQuantity(entry: DiaryEntry, quantity: number) {
    return write((owner) => updateEntryQuantity(db, owner, entry.id, quantity, new Date()));
  }

  function remove(entry: DiaryEntry) {
    return write((owner) => deleteEntry(db, owner, entry.id, new Date()));
  }

  async function confirm(items: readonly PlanItem[], quantity?: number) {
    if (userId === undefined) return;
    try {
      for (const item of items) {
        await confirmPlanItem(db, {
          userId,
          date,
          item,
          quantity: quantity ?? item.quantity,
          now: new Date(),
        });
      }
    } catch (error: unknown) {
      console.error('Voce prevista non confermata', error);
      Alert.alert('Voce non salvata', 'Il telefono non è riuscito a salvarla. Riprova.');
      return;
    }
    setConfirming(null);
    await load();
  }

  async function chooseDayType(id: string) {
    if (userId === undefined || id === dayTypeId) return;
    setDayTypeId(id);
    try {
      await setDayType(db, userId, date, id, new Date());
    } catch (error: unknown) {
      console.error('Tipo di giornata non salvato', error);
      Alert.alert('Modifica non salvata', 'Il telefono non è riuscito a salvarla. Riprova.');
    }
    await load();
  }

  const dayTypeName = dayTypes.find((type) => type.id === dayTypeId)?.name;

  const editingSlot = editing ? slots.find((slot) => slot.id === editing.mealSlotId) : undefined;

  return (
    <View style={styles.screen}>
      <ScrollView
        testID="diario"
        contentContainerStyle={styles.content}
        importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={editing !== null}
      >
        <View style={styles.dayNav}>
          <PressableScale
            onPress={() => setDate(addDays(date, -1))}
            accessibilityLabel="Giorno precedente"
            style={styles.dayButton}
          >
            <Icon name="chevronLeft" color="text" />
          </PressableScale>
          {date === today ? (
            <View style={styles.dayLabel}>
              <TaraText variant="bodyStrong">{dayLabel(date)}</TaraText>
            </View>
          ) : (
            <PressableScale
              onPress={() => setDate(today)}
              accessibilityLabel={`${dayLabel(date)}, torna a oggi`}
              style={styles.dayLabel}
            >
              <TaraText variant="bodyStrong">{dayLabel(date)}</TaraText>
              <TaraText variant="caption" color="textSecondary">
                Torna a oggi
              </TaraText>
            </PressableScale>
          )}
          <PressableScale
            onPress={() => setDate(addDays(date, 1))}
            accessibilityLabel="Giorno successivo"
            style={styles.dayButton}
          >
            <Icon name="chevronRight" color="text" />
          </PressableScale>
        </View>

        {dayTypes.length > 1 ? (
          <Segmented
            label="Tipo di giornata"
            options={dayTypes.map((type) => ({ key: type.id, label: type.name }))}
            selectedKey={dayTypeId}
            onSelect={(id) => void chooseDayType(id)}
          />
        ) : null}

        <DayGoals
          totals={totals(entries)}
          planned={totals(pending)}
          target={target}
          dayTypeName={dayTypeName}
          onSetTargets={() => router.navigate('/piano')}
        />

        {entries.length > 0 ? (
          <View style={styles.legend}>
            <TaraText variant="minimum" color="textSecondary">
              peso, kcal, prot.
            </TaraText>
          </View>
        ) : null}

        {slots.map((slot) => {
          const own = entries.filter((entry) => entry.mealSlotId === slot.id);
          const sum = totals(own);
          const ownPending = pending.filter((item) => item.mealSlotId === slot.id);
          const status = mealPlanStatus(
            plan.filter((item) => item.mealSlotId === slot.id).length,
            ownPending.length,
            own.length,
          );
          return (
            <MealSection
              key={slot.id}
              name={slot.name}
              kcal={sum.energy_kcal}
              protein={sum.protein_g}
              progress={status.progress}
              collapsed={status.complete && !opened.has(slot.id)}
              onToggle={
                status.complete
                  ? () =>
                      setOpened((current) => {
                        const next = new Set(current);
                        if (next.has(slot.id)) next.delete(slot.id);
                        else next.add(slot.id);
                        return next;
                      })
                  : undefined
              }
              onConfirmAll={() => void confirm(ownPending)}
              planned={ownPending.map((item) => ({
                key: item.id,
                row: (
                  <PlannedRow
                    name={item.foodName}
                    quantity={item.quantity}
                    unit={item.unit}
                    kcal={entryAmount(item.snapshot, 'energy_kcal', item.quantity)}
                    protein={entryAmount(item.snapshot, 'protein_g', item.quantity)}
                    onConfirm={() => void confirm([item])}
                    onEdit={() => setConfirming(item)}
                  />
                ),
              }))}
              onAdd={() =>
                router.push({
                  pathname: '/cerca',
                  params: { slot: slot.id, date },
                })
              }
              entries={own.map((entry) => ({
                key: entry.id,
                row: (
                  <DiaryRow
                    name={entry.foodName}
                    state={entry.foodState}
                    quantity={entry.quantity}
                    unit={entry.unit}
                    kcal={entryAmount(entry.snapshot, 'energy_kcal', entry.quantity)}
                    protein={entryAmount(entry.snapshot, 'protein_g', entry.quantity)}
                    onPress={() => setEditing(entry)}
                  />
                ),
              }))}
            />
          );
        })}
      </ScrollView>

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
            confirmVerb="Salva"
            onConfirm={(quantity) => void saveQuantity(editing, quantity)}
            onDelete={() => void remove(editing)}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </Modal>

      <Modal
        visible={confirming !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setConfirming(null)}
      >
        {confirming ? (
          <GramSheet
            visible
            food={{
              name: confirming.foodName,
              state: confirming.foodState,
              per100: Object.fromEntries(
                Object.entries(confirming.snapshot).map(([code, value]) => [code, value.amount]),
              ),
            }}
            mealName={slots.find((slot) => slot.id === confirming.mealSlotId)?.name}
            startGrams={confirming.quantity}
            confirmVerb="Conferma"
            onConfirm={(quantity) => void confirm([confirming], quantity)}
            onClose={() => setConfirming(null)}
          />
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.l, gap: space.l, paddingBottom: space.xxxl },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayButton: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    flex: 1,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    alignItems: 'flex-end',
    paddingHorizontal: space.m,
    marginBottom: -space.s,
  },
});
