import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { TaraText } from '@/components/TaraText';
import { TextField } from '@/components/TextField';
import { archivedMealSlots, ensureMealSlots, type MealSlot } from '@/data/diaryStore';
import {
  addMealSlot,
  archiveMealSlot,
  deleteMealSlot,
  MealSlotError,
  moveMealSlot,
  renameMealSlot,
  restoreMealSlot,
  setMealSlotTime,
  slotsInUse,
} from '@/data/mealSlotsStore';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

interface Draft {
  name?: string;
  time?: string;
}

/** "7:30" o "7.30" diventano "07:30"; il resto passa com'è e lo giudica l'archivio. */
function normalizeTime(text: string): string | null {
  const clean = text.trim();
  if (clean === '') return null;
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(clean);
  return match ? `${(match[1] ?? '').padStart(2, '0')}:${match[2] ?? ''}` : clean;
}

/**
 * Pasti della giornata (RF-40): nome, orario facoltativo con cui il pasto viene proposto,
 * ordine, eliminazione e aggiunta. Nome e orario si salvano uscendo dal campo; le altre
 * azioni salvano prima ciò che è stato scritto.
 */
export default function MealSlotsScreen() {
  const db: SqlDatabase = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;

  const [slots, setSlots] = useState<MealSlot[]>([]);
  const [archived, setArchived] = useState<MealSlot[]>([]);
  // I pasti con voci di diario o di piano: non si eliminano, si archiviano.
  const [inUse, setInUse] = useState<ReadonlySet<string>>(new Set());
  // Ciò che si sta scrivendo e non è ancora salvato, per pasto.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newName, setNewName] = useState('');
  const [newTime, setNewTime] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  // Le scritture dei campi vanno una dopo l'altra: l'uscita da un campo e il tocco su un
  // pulsante arrivano quasi insieme.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const reload = useCallback(async () => {
    if (userId === undefined) return;
    const [active, hidden, used] = await Promise.all([
      ensureMealSlots(db, userId, new Date()),
      archivedMealSlots(db, userId),
      slotsInUse(db, userId),
    ]);
    setSlots(active);
    setArchived(hidden);
    setInUse(used);
  }, [db, userId]);

  useFocusEffect(
    useCallback(() => {
      void reload().catch((error: unknown) => console.error('Pasti non letti', error));
    }, [reload]),
  );

  function fail(title: string, error: unknown) {
    if (error instanceof MealSlotError) Alert.alert(title, error.message);
    else {
      console.error(title, error);
      Alert.alert(title, 'Il telefono non è riuscito a salvarlo. Riprova.');
    }
  }

  function setDraft(id: string, change: Draft) {
    setDrafts((previous) => ({ ...previous, [id]: { ...previous[id], ...change } }));
  }

  /** Salva nome e orario scritti per un pasto; se non vanno bene ripristina e lo dice. */
  function commit(slot: MealSlot, draft: Draft | undefined): Promise<void> {
    if (userId === undefined || draft === undefined) return Promise.resolve();
    const step = async () => {
      let failure: unknown;
      try {
        if (draft.name !== undefined && draft.name.trim() !== slot.name) {
          await renameMealSlot(db, userId, slot.id, draft.name, new Date());
        }
      } catch (error: unknown) {
        failure = error;
      }
      try {
        if (draft.time !== undefined) {
          const time = normalizeTime(draft.time);
          if (time !== slot.expectedTime) {
            await setMealSlotTime(db, userId, slot.id, time, new Date());
          }
        }
      } catch (error: unknown) {
        failure ??= error;
      }
      // Il pasto torna a mostrare ciò che è salvato (anche dopo un rifiuto).
      setDrafts(({ [slot.id]: _done, ...rest }) => rest);
      try {
        await reload();
      } catch (error: unknown) {
        console.error('Pasti non letti', error);
      }
      if (failure !== undefined) fail('Pasto non salvato', failure);
    };
    queue.current = queue.current.then(step);
    return queue.current;
  }

  /** Salva tutto ciò che è stato scritto e non ancora salvato. */
  async function flush() {
    await Promise.all(slots.map((slot) => commit(slot, drafts[slot.id])));
  }

  /** Un'azione alla volta: i tocchi ripetuti mentre scrive vengono ignorati. */
  async function act(task: () => Promise<void>, title: string) {
    if (userId === undefined || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await flush();
      await task();
      await reload();
    } catch (error: unknown) {
      fail(title, error);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const move = (slot: MealSlot, direction: 'up' | 'down') =>
    act(() => moveMealSlot(db, userId ?? '', slot.id, direction, new Date()), 'Pasto non spostato');

  function confirmDelete(slot: MealSlot) {
    Alert.alert(`Eliminare «${slot.name}»?`, 'Il pasto sparisce da Oggi, Piano e ricerca.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () =>
          void act(
            () => deleteMealSlot(db, userId ?? '', slot.id, new Date()),
            'Pasto non eliminato',
          ),
      },
    ]);
  }

  const archive = (slot: MealSlot) =>
    act(() => archiveMealSlot(db, userId ?? '', slot.id, new Date()), 'Pasto non archiviato');

  const restore = (slot: MealSlot) =>
    act(() => restoreMealSlot(db, userId ?? '', slot.id, new Date()), 'Pasto non ripristinato');

  const add = () =>
    act(async () => {
      await addMealSlot(db, userId ?? '', newName, normalizeTime(newTime), new Date());
      setNewName('');
      setNewTime('');
    }, 'Pasto non aggiunto');

  const cardColors = { backgroundColor: colors.surface, borderColor: colors.border };

  async function back() {
    if (locked.current) return;
    await flush();
    router.back();
  }

  return (
    // Con l'edge-to-edge di Android la finestra non si ridimensiona per la tastiera.
    // L'intestazione è della schermata, così il calcolo del padding parte da 0.
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}
      behavior="padding"
    >
      <View style={styles.topBar}>
        <PressableScale
          onPress={() => void back()}
          accessibilityLabel="Indietro"
          testID="pasti-indietro"
          style={styles.iconButton}
        >
          <Icon name="chevronLeft" color="text" />
        </PressableScale>
        <TaraText variant="section" accessibilityRole="header">
          Pasti della giornata
        </TaraText>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: space.l + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        testID="pasti"
      >
        <TaraText color="textSecondary">
          L’orario, se c’è, serve a proporre il pasto giusto quando registri un alimento.
        </TaraText>
        {slots.map((slot, index) => {
          const draft = drafts[slot.id];
          const used = inUse.has(slot.id);
          return (
            <View key={slot.id} style={[styles.card, cardColors]}>
              <View style={styles.row}>
                <View style={styles.name}>
                  <TextField
                    compact
                    label={`Nome del pasto ${slot.name}`}
                    value={draft?.name ?? slot.name}
                    onChangeText={(name) => setDraft(slot.id, { name })}
                    onEndEditing={() => void commit(slot, drafts[slot.id])}
                    autoCapitalize="sentences"
                    returnKeyType="done"
                    testID={`pasto-nome-${index}`}
                  />
                </View>
                <View style={styles.time}>
                  <TextField
                    compact
                    label={`Orario di ${slot.name}`}
                    value={draft?.time ?? slot.expectedTime ?? ''}
                    onChangeText={(time) => setDraft(slot.id, { time })}
                    onEndEditing={() => void commit(slot, drafts[slot.id])}
                    placeholder="--:--"
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    returnKeyType="done"
                    testID={`pasto-orario-${index}`}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.note} />
                <PressableScale
                  onPress={() => void move(slot, 'up')}
                  disabled={busy || index === 0}
                  accessibilityLabel={`Sposta su ${slot.name}`}
                  testID={`pasto-su-${index}`}
                  style={styles.iconButton}
                >
                  <Icon name="chevronUp" color="text" />
                </PressableScale>
                <PressableScale
                  onPress={() => void move(slot, 'down')}
                  disabled={busy || index === slots.length - 1}
                  accessibilityLabel={`Sposta giù ${slot.name}`}
                  testID={`pasto-giu-${index}`}
                  style={styles.iconButton}
                >
                  <Icon name="chevronDown" color="text" />
                </PressableScale>
                <PressableScale
                  onPress={() => void archive(slot)}
                  disabled={busy}
                  accessibilityLabel={`Archivia ${slot.name}`}
                  accessibilityHint={
                    used
                      ? 'Ha voci nel diario o nel piano: lo nascondo dai pasti futuri, i giorni passati restano.'
                      : undefined
                  }
                  testID={`pasto-archivia-${index}`}
                  style={styles.textButton}
                >
                  <TaraText variant="caption">Archivia</TaraText>
                </PressableScale>
                {used ? null : (
                  <PressableScale
                    onPress={() => confirmDelete(slot)}
                    disabled={busy}
                    accessibilityLabel={`Elimina ${slot.name}`}
                    testID={`pasto-elimina-${index}`}
                    style={styles.iconButton}
                  >
                    <Icon name="delete" color="text" />
                  </PressableScale>
                )}
              </View>
            </View>
          );
        })}

        <View style={[styles.card, cardColors]}>
          <View style={styles.row}>
            <View style={styles.name}>
              <TextField
                compact
                label="Nome del nuovo pasto"
                value={newName}
                onChangeText={setNewName}
                placeholder="Nuovo pasto"
                autoCapitalize="sentences"
                returnKeyType="done"
                testID="nuovo-pasto-nome"
              />
            </View>
            <View style={styles.time}>
              <TextField
                compact
                label="Orario del nuovo pasto"
                value={newTime}
                onChangeText={setNewTime}
                placeholder="--:--"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                returnKeyType="done"
                testID="nuovo-pasto-orario"
              />
            </View>
          </View>
          <Button
            kind="secondary"
            label="Aggiungi un pasto"
            onPress={() => void add()}
            disabled={newName.trim() === ''}
            loading={busy}
            testID="aggiungi-pasto"
          />
        </View>
        {archived.length > 0 ? (
          <View style={styles.archived}>
            <TaraText variant="minimum" color="textSecondary">
              Archiviati
            </TaraText>
            {archived.map((slot, index) => (
              <View key={slot.id} style={[styles.card, styles.row, cardColors]}>
                <TaraText numberOfLines={1} style={styles.note}>
                  {slot.name}
                </TaraText>
                <PressableScale
                  onPress={() => void restore(slot)}
                  disabled={busy}
                  accessibilityLabel={`Ripristina ${slot.name}`}
                  testID={`pasto-ripristina-${index}`}
                  style={styles.textButton}
                >
                  <TaraText variant="caption">Ripristina</TaraText>
                </PressableScale>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  iconButton: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: space.l, gap: space.s },
  card: {
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    gap: space.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { flex: 1 },
  time: { width: 96 },
  note: { flex: 1 },
  textButton: {
    minHeight: touch.min,
    minWidth: touch.min,
    paddingHorizontal: space.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archived: { gap: space.s, marginTop: space.s },
});
