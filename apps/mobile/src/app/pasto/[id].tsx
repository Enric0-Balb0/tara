import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GramSheet } from '@/components/GramSheet';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { StateTag } from '@/components/StateTag';
import { TaraText } from '@/components/TaraText';
import { TextField } from '@/components/TextField';
import {
  deleteSavedMeal,
  removeSavedMealItem,
  renameSavedMeal,
  type SavedMealItem,
  savedMealItems,
  savedMeals,
  updateSavedMealItem,
} from '@/data/savedMealsStore';
import { ingredientValues } from '@/data/recipesStore';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import { formatAmount } from '@/domain/format';
import { space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

/**
 * Un pasto salvato (RF-32): nome modificabile, voci con i grammi modificabili e rimovibili,
 * eliminazione con conferma. Le modifiche valgono per le registrazioni future: le voci già
 * nel diario restano come sono (snapshot).
 */
export default function SavedMealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db: SqlDatabase = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;
  // undefined: si sta leggendo; null: il pasto non c'è.
  const [savedName, setSavedName] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [items, setItems] = useState<SavedMealItem[]>([]);
  // Valori per 100 degli alimenti, per l'anteprima dei macro nel foglio dei grammi.
  const [values, setValues] = useState<Record<string, Record<string, number>>>({});
  const [editing, setEditing] = useState<SavedMealItem | null>(null);
  // Una scrittura alla volta: un doppio tocco non la ripete.
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (userId === undefined || id === undefined) return;
    try {
      const [all, rows] = await Promise.all([
        savedMeals(db, userId),
        savedMealItems(db, userId, id),
      ]);
      const meal = all.find((candidate) => candidate.id === id);
      const read = await ingredientValues(
        db,
        rows.map((row) => row.foodId),
      );
      setSavedName(meal?.name ?? null);
      setItems(rows);
      setValues(read.values);
      // Il nome che si sta scrivendo non si sovrascrive rileggendo dopo una modifica delle voci.
      if (meal) setName((current) => (current === '' ? meal.name : current));
    } catch (error: unknown) {
      console.error('Pasto salvato non letto', error);
      setSavedName(null);
    }
  }, [db, userId, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function write(
    change: (owner: string, mealId: string) => Promise<void>,
    failed: string,
  ): Promise<boolean> {
    if (userId === undefined || id === undefined || busy.current) return false;
    busy.current = true;
    try {
      await change(userId, id);
    } catch (error: unknown) {
      console.error(failed, error);
      Alert.alert(failed, 'Il telefono non è riuscito a salvare. Riprova.');
      return false;
    } finally {
      busy.current = false;
    }
    await load();
    return true;
  }

  const trimmed = name.trim();
  const renamed = savedName != null && trimmed !== '' && trimmed !== savedName;

  function confirmDelete() {
    if (savedName == null) return;
    Alert.alert(
      `Eliminare «${savedName}»?`,
      'Le voci già nel diario restano, con i valori di quando le hai registrate.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => {
            void write(
              (owner, mealId) => deleteSavedMeal(db, owner, mealId, new Date()),
              'Pasto non eliminato',
            ).then((done) => {
              if (done) router.back();
            });
          },
        },
      ],
    );
  }

  // Togliere una voce non si annulla: si chiede conferma. Il doppio tocco è già coperto da `busy`.
  function confirmRemove(item: SavedMealItem) {
    Alert.alert(`Togliere «${item.foodName}» dal pasto?`, 'La voce non si può recuperare.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Togli',
        style: 'destructive',
        onPress: () => {
          void write(
            (owner) => removeSavedMealItem(db, owner, item.id, new Date()),
            'Alimento non rimosso',
          );
        },
      },
    ]);
  }

  return (
    // Come in ricetta: intestazione propria e padding per la tastiera su Android.
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}
      behavior="padding"
    >
      <View style={styles.topBar}>
        <PressableScale
          onPress={() => router.back()}
          accessibilityLabel="Indietro"
          style={styles.back}
        >
          <Icon name="chevronLeft" color="text" />
        </PressableScale>
        <TaraText variant="section" accessibilityRole="header">
          Pasto salvato
        </TaraText>
      </View>
      {savedName === null ? (
        <View style={styles.missing}>
          <TaraText variant="section">Pasto non trovato</TaraText>
          <Button label="Torna indietro" kind="secondary" onPress={() => router.back()} />
        </View>
      ) : savedName === undefined ? null : (
        <>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            testID="pasto-salvato"
          >
            <View style={styles.field}>
              <TextField
                label="Nome"
                value={name}
                onChangeText={setName}
                invalid={trimmed === ''}
                autoCapitalize="sentences"
                testID="campo-nome-pasto"
              />
              {trimmed === '' ? (
                <TaraText variant="caption" color="error">
                  Scrivi il nome del pasto.
                </TaraText>
              ) : null}
              {renamed ? (
                <Button
                  label="Salva nome"
                  kind="secondary"
                  testID="salva-nome-pasto"
                  onPress={() =>
                    void write(
                      (owner, mealId) => renameSavedMeal(db, owner, mealId, trimmed, new Date()),
                      'Nome non salvato',
                    )
                  }
                />
              ) : null}
            </View>

            <View style={styles.field}>
              <TaraText variant="bodyStrong" accessibilityRole="header">
                Alimenti
              </TaraText>
              {items.length === 0 ? (
                <TaraText color="textSecondary">Il pasto non ha più alimenti.</TaraText>
              ) : null}
              {items.map((item) => {
                const unitWord = item.unit === 'ml' ? 'millilitri' : 'grammi';
                return (
                  <View key={item.id} style={[styles.item, { borderBottomColor: colors.border }]}>
                    <PressableScale
                      onPress={() => setEditing(item)}
                      accessibilityLabel={`${item.foodName}, ${formatAmount(item.quantity, 'grams')} ${unitWord}. Modifica`}
                      style={styles.itemMain}
                    >
                      <View style={styles.itemName}>
                        <TaraText numberOfLines={2} style={styles.itemText}>
                          {item.foodName}
                        </TaraText>
                        <StateTag state={item.foodState} />
                      </View>
                      <TaraText variant="bodyStrong">
                        {formatAmount(item.quantity, 'grams')} {item.unit}
                      </TaraText>
                    </PressableScale>
                    <PressableScale
                      onPress={() => confirmRemove(item)}
                      accessibilityLabel={`Rimuovi ${item.foodName} dal pasto`}
                      style={styles.remove}
                    >
                      <Icon name="close" color="textSecondary" />
                    </PressableScale>
                  </View>
                );
              })}
            </View>

            <Button
              label="Elimina pasto salvato"
              kind="quiet"
              onPress={confirmDelete}
              testID="elimina-pasto-salvato"
            />
          </ScrollView>
          {editing ? (
            <GramSheet
              visible
              food={{
                name: editing.foodName,
                state: editing.foodState,
                per100: values[editing.foodId] ?? {},
              }}
              startGrams={editing.quantity}
              unit={editing.unit}
              confirmVerb="Salva"
              onConfirm={(grams) => {
                const item = editing;
                void write(
                  (owner) => updateSavedMealItem(db, owner, item.id, grams, new Date()),
                  'Quantità non salvata',
                ).then((done) => {
                  if (done) setEditing(null);
                });
              }}
              onClose={() => setEditing(null)}
            />
          ) : null}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  back: {
    width: touch.min,
    height: touch.min,
    marginLeft: space.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: space.l, gap: space.l },
  field: { gap: space.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemMain: {
    flex: 1,
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.m,
  },
  itemName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s },
  itemText: { flexShrink: 1 },
  remove: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.l },
});
