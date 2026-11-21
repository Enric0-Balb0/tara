import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GramSheet } from '@/components/GramSheet';
import { Icon } from '@/components/Icon';
import { NutritionLabel } from '@/components/NutritionLabel';
import { PressableScale } from '@/components/PressableScale';
import { Segmented } from '@/components/Segmented';
import { StateTag } from '@/components/StateTag';
import { TaraText } from '@/components/TaraText';
import { TextField } from '@/components/TextField';
import { getFood } from '@/data/catalogStore';
import {
  clearDraft,
  readYield,
  removeItem,
  setItemGrams,
  setName,
  setYieldMode,
  setYieldText,
  startDraft,
  useRecipeDraft,
} from '@/data/recipeDraft';
import { createRecipe, recipeDetail, updateRecipe } from '@/data/recipesStore';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import { formatAmount } from '@/domain/format';
import { recipeValues } from '@/domain/recipe';
import { space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

const YIELDS = [
  { key: 'portions', label: 'Porzioni' },
  { key: 'weight', label: 'Peso da cotto' },
] as const;

type Per100 = Record<string, number>;

// Il numero come si scrive nel campo: virgola decimale, senza zeri in coda.
const typed = (value: number) => String(value).replace('.', ',');

/**
 * Nuova ricetta (RF-20), o la modifica di una esistente con `id` (la bozza si carica da
 * sola). Gli ingredienti si scelgono dalla ricerca (`ricetta=1`) e tornano nella bozza in
 * memoria; si scrive nel database solo con "Salva la ricetta".
 */
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db: SqlDatabase = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;
  const draft = useRecipeDraft();
  const [missing, setMissing] = useState(false);
  const [values, setValues] = useState<Record<string, Per100>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const ready = id === undefined || draft.recipeId === id;

  // Uscendo dalla schermata (salvata o no) la bozza si butta; la ricerca degli ingredienti
  // sta sopra di lei nello Stack, quindi non la smonta.
  useEffect(() => () => clearDraft(), []);

  useEffect(() => {
    if (id === undefined || userId === undefined || draft.recipeId === id) return undefined;
    let current = true;
    void recipeDetail(db, userId, id)
      .then((detail) => {
        if (!current) return;
        if (detail === null) {
          setMissing(true);
          return;
        }
        startDraft({
          recipeId: id,
          name: detail.name,
          yield:
            detail.yield.mode === 'portions'
              ? { mode: 'portions', text: typed(detail.yield.portions) }
              : { mode: 'weight', text: typed(detail.yield.cookedWeightG) },
          items: detail.items.map((item) => ({
            key: item.id,
            foodId: item.foodId,
            foodName: item.foodName,
            foodState: item.foodState,
            gramsRaw: item.gramsRaw,
          })),
        });
      })
      .catch((error: unknown) => {
        console.error('Ricetta non letta', error);
        if (current) setMissing(true);
      });
    return () => {
      current = false;
    };
  }, [db, userId, id, draft.recipeId]);

  // I valori degli ingredienti si leggono dal catalogo, una volta per alimento.
  const wanted = [...new Set(draft.items.map((item) => item.foodId))]
    .filter((foodId) => values[foodId] === undefined)
    .join(',');
  useEffect(() => {
    if (wanted === '') return undefined;
    let current = true;
    void Promise.all(
      wanted.split(',').map(async (foodId) => {
        const food = await getFood(db, foodId);
        return [
          foodId,
          Object.fromEntries((food?.nutrients ?? []).map((n) => [n.code, n.amountPer100])),
        ] as const;
      }),
    )
      .then((entries) => {
        if (current) setValues((previous) => ({ ...previous, ...Object.fromEntries(entries) }));
      })
      .catch((error: unknown) => console.error('Valori non letti', error));
    return () => {
      current = false;
    };
  }, [db, wanted]);

  const recipeYield = readYield(draft.yield);
  const nameOk = draft.name.trim() !== '';
  const itemsOk = draft.items.length > 0;
  const errors = {
    name: nameOk ? undefined : 'Scrivi il nome della ricetta.',
    items: itemsOk ? undefined : 'Aggiungi almeno un ingrediente.',
    yield:
      recipeYield !== null
        ? undefined
        : draft.yield.mode === 'portions'
          ? 'Scrivi le porzioni: un numero maggiore di zero.'
          : 'Scrivi il peso da cotto in grammi, maggiore di zero.',
  };
  // Gli errori compaiono dopo il primo "Salva", non mentre si inizia a scrivere.
  const shown = tried ? errors : { name: undefined, items: undefined, yield: undefined };

  const loadedAll = draft.items.every((item) => values[item.foodId] !== undefined);
  const result =
    recipeYield !== null && itemsOk && loadedAll
      ? recipeValues(
          draft.items.map((item) => ({
            grams: item.gramsRaw,
            per100: values[item.foodId] ?? {},
          })),
          recipeYield,
        )
      : null;

  const editing = draft.items.find((item) => item.key === editingKey);

  async function save() {
    setTried(true);
    if (!nameOk || !itemsOk || recipeYield === null || userId === undefined || busy.current) {
      return;
    }
    busy.current = true;
    setSaving(true);
    const input = {
      name: draft.name,
      yield: recipeYield,
      items: draft.items.map((item) => ({ foodId: item.foodId, gramsRaw: item.gramsRaw })),
    };
    try {
      if (draft.recipeId !== null) {
        if (!(await updateRecipe(db, userId, draft.recipeId, input, new Date()))) {
          Alert.alert('Modifiche non salvate', 'La ricetta non è più nel tuo catalogo.');
          router.back();
          return;
        }
      } else await createRecipe(db, userId, input, new Date());
      clearDraft();
      router.back();
    } catch (error: unknown) {
      console.error('Ricetta non salvata', error);
      Alert.alert('Ricetta non salvata', 'Il telefono non è riuscito a salvarla. Riprova.');
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    // Come in nuovo-alimento: intestazione propria e padding per la tastiera su Android.
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
          {id ? 'Modifica ricetta' : 'Nuova ricetta'}
        </TaraText>
      </View>
      {missing ? (
        <View style={styles.missing}>
          <TaraText variant="section">Ricetta non trovata</TaraText>
          <Button label="Torna indietro" kind="secondary" onPress={() => router.back()} />
        </View>
      ) : ready ? (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            testID="ricetta"
          >
            <View style={styles.field}>
              <TextField
                label="Nome"
                value={draft.name}
                onChangeText={setName}
                invalid={shown.name !== undefined}
                autoCapitalize="sentences"
                testID="campo-nome-ricetta"
              />
              {shown.name ? (
                <TaraText variant="caption" color="error">
                  {shown.name}
                </TaraText>
              ) : null}
            </View>

            <Segmented
              label="Resa"
              options={YIELDS}
              selectedKey={draft.yield.mode}
              onSelect={(key) => setYieldMode(key as 'portions' | 'weight')}
            />
            <View style={styles.field}>
              <TextField
                label={draft.yield.mode === 'portions' ? 'Porzioni' : 'Peso da cotto (g)'}
                value={draft.yield.text}
                onChangeText={setYieldText}
                keyboardType="decimal-pad"
                invalid={shown.yield !== undefined}
                testID={draft.yield.mode === 'portions' ? 'campo-porzioni' : 'campo-peso-cotto'}
              />
              {shown.yield ? (
                <TaraText variant="caption" color="error">
                  {shown.yield}
                </TaraText>
              ) : null}
            </View>

            <View style={styles.field}>
              <TaraText variant="bodyStrong" accessibilityRole="header">
                Ingredienti
              </TaraText>
              {draft.items.map((item) => (
                <PressableScale
                  key={item.key}
                  onPress={() => setEditingKey(item.key)}
                  accessibilityLabel={`${item.foodName}, ${formatAmount(item.gramsRaw, 'grams')} grammi. Modifica`}
                  testID={`ingrediente-${item.foodId}`}
                  style={[styles.item, { borderBottomColor: colors.border }]}
                >
                  <View style={styles.itemName}>
                    <TaraText numberOfLines={2} style={styles.itemText}>
                      {item.foodName}
                    </TaraText>
                    <StateTag state={item.foodState} />
                  </View>
                  <TaraText variant="bodyStrong">{formatAmount(item.gramsRaw, 'grams')} g</TaraText>
                </PressableScale>
              ))}
              {shown.items ? (
                <TaraText variant="caption" color="error">
                  {shown.items}
                </TaraText>
              ) : null}
              <Button
                label="Aggiungi ingrediente"
                kind="secondary"
                onPress={() => router.push({ pathname: '/cerca', params: { ricetta: '1' } })}
                testID="aggiungi-ingrediente"
              />
            </View>

            {result !== null ? (
              <View style={styles.field}>
                <NutritionLabel per100={result.per100} grams={100} />
                {result.servingG !== null ? (
                  <TaraText color="textSecondary" testID="porzione-ricetta">
                    1 porzione = {formatAmount(result.servingG, 'grams')} g
                  </TaraText>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
          <View
            style={[
              styles.actions,
              { paddingBottom: space.l + insets.bottom, borderTopColor: colors.border },
            ]}
          >
            <Button
              label="Salva la ricetta"
              onPress={() => void save()}
              loading={saving}
              testID="salva-ricetta"
            />
          </View>
          {editing ? (
            <GramSheet
              visible
              food={{
                name: editing.foodName,
                state: editing.foodState,
                per100: values[editing.foodId] ?? {},
              }}
              startGrams={editing.gramsRaw}
              confirmVerb="Salva"
              onConfirm={(grams) => {
                setItemGrams(editing.key, grams);
                setEditingKey(null);
              }}
              onDelete={() => {
                removeItem(editing.key);
                setEditingKey(null);
              }}
              onClose={() => setEditingKey(null)}
            />
          ) : null}
        </>
      ) : null}
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
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s },
  itemText: { flexShrink: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.l },
  actions: {
    paddingHorizontal: space.l,
    paddingTop: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
