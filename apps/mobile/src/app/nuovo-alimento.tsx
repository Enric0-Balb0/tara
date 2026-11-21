import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { LabelForm } from '@/components/LabelForm';
import { PressableScale } from '@/components/PressableScale';
import { Segmented } from '@/components/Segmented';
import { TaraText } from '@/components/TaraText';
import { TextField } from '@/components/TextField';
import { getFood } from '@/data/catalogStore';
import { createFood, deleteFood, updateFood } from '@/data/foodsStore';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import type { BaseUnit, FoodState } from '@/domain/food';
import { formatNumber } from '@/domain/format';
import {
  emptyFoodTexts,
  type FoodTexts,
  foodTextsOf,
  kcalCheckText,
  readFoodForm,
} from '@/domain/foodForm';
import { space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

// "n.a." non compare nell'interfaccia (docs/design.md): è ciò che si pesa così com'è.
const STATES: readonly { key: FoodState; label: string }[] = [
  { key: 'not_applicable', label: "Così com'è" },
  { key: 'raw', label: 'Crudo' },
  { key: 'cooked', label: 'Cotto' },
];
const UNITS: readonly { key: BaseUnit; label: string }[] = [
  { key: 'g', label: 'Per 100 g' },
  { key: 'ml', label: 'Per 100 ml' },
];

/**
 * Nuovo alimento a mano (RF-18), o la modifica di uno del catalogo personale con `id`.
 * Dalla ricerca arriva il nome già scritto e, salvato, si apre la scheda per registrarlo
 * nel pasto da cui si era partiti; dalla Dispensa si torna alla lista.
 */
export default function NewFoodScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    from?: string;
    slot?: string;
    date?: string;
    plan?: string;
  }>();
  const editing = params.id;
  const db: SqlDatabase = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;

  // Dalla ricerca il nome arriva com'è scritto, di solito minuscolo: si alza la prima lettera.
  const [name, setName] = useState(() => {
    const typed = params.name?.trim() ?? '';
    return typed.charAt(0).toUpperCase() + typed.slice(1);
  });
  const [brand, setBrand] = useState('');
  const [state, setState] = useState<FoodState>('not_applicable');
  const [unit, setUnit] = useState<BaseUnit>('g');
  const [texts, setTexts] = useState<FoodTexts>(emptyFoodTexts);
  // In modifica il form si mostra quando l'alimento è letto, per non sovrascriverlo vuoto;
  // 'missing' se non c'è più (eliminato altrove) o non si legge.
  const [loaded, setLoaded] = useState<boolean | 'missing'>(editing === undefined);
  // I campi obbligatori si segnalano dopo il primo "Salva", non mentre si inizia a scrivere.
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (editing === undefined) return undefined;
    let current = true;
    void getFood(db, editing)
      .then((food) => {
        if (!current) return;
        if (food === null || !food.personal) {
          setLoaded('missing');
          return;
        }
        setName(food.name);
        setBrand(food.brand ?? '');
        setState(food.state);
        setUnit(food.baseUnit);
        setTexts(
          foodTextsOf(
            Object.fromEntries(food.nutrients.map((n) => [n.code, n.amountPer100])),
            food.nutrients.filter((n) => n.provenance === 'estimated').map((n) => n.code),
          ),
        );
        setLoaded(true);
      })
      .catch((error: unknown) => {
        console.error('Alimento non letto', error);
        if (current) setLoaded('missing');
      });
    return () => {
      current = false;
    };
  }, [db, editing]);

  const form = readFoodForm(name, texts);
  const check = kcalCheckText(form.values);
  // Prima del primo tentativo solo gli errori dei valori scritti (un numero non valido, un
  // "di cui" troppo grande); dopo, anche ciò che manca.
  const shown = tried
    ? form.errors
    : Object.fromEntries(
        Object.entries(form.errors).filter(
          ([code]) => code === 'total' || (texts[code] ?? '').trim() !== '',
        ),
      );

  async function save() {
    setTried(true);
    if (!form.ok || userId === undefined || busy.current) return;
    busy.current = true;
    setSaving(true);
    const input = {
      name,
      brand,
      state,
      baseUnit: unit,
      values: form.values,
      derived: form.derived,
    };
    try {
      if (editing !== undefined) {
        if (!(await updateFood(db, userId, editing, input, new Date()))) {
          Alert.alert('Modifiche non salvate', "L'alimento non è più nel tuo catalogo.");
          router.dismiss(2);
          return;
        }
        router.back();
        return;
      }
      const id = await createFood(db, userId, input, new Date());
      if (params.from === 'cerca') {
        // Dalla ricerca si va alla scheda, con pasto e giorno da cui si era partiti.
        router.replace({
          pathname: '/alimento/[id]',
          params: {
            id,
            ...(params.slot ? { slot: params.slot } : {}),
            ...(params.date ? { date: params.date } : {}),
            ...(params.plan ? { plan: params.plan } : {}),
          },
        });
      } else router.back();
    } catch (error: unknown) {
      console.error('Alimento non salvato', error);
      Alert.alert('Alimento non salvato', 'Il telefono non è riuscito a salvarlo. Riprova.');
      busy.current = false;
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (editing === undefined || userId === undefined) return;
    Alert.alert(
      `Eliminare «${name.trim()}»?`,
      'Le voci già nel diario restano, con i valori di quando le hai registrate.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => {
            void deleteFood(db, userId, editing, new Date())
              // Via la modifica e la scheda dell'alimento che non c'è più.
              .then(() => router.dismiss(2))
              .catch((error: unknown) => {
                console.error('Alimento non eliminato', error);
                Alert.alert('Alimento non eliminato', 'Il telefono non è riuscito. Riprova.');
              });
          },
        },
      ],
    );
  }

  return (
    // Con l'edge-to-edge di Android la finestra non si ridimensiona per la tastiera: senza
    // padding le righe in basso dell'etichetta resterebbero sotto i tasti, irraggiungibili.
    // L'intestazione è della schermata, così il calcolo del padding parte da 0.
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
          {editing ? 'Modifica alimento' : 'Nuovo alimento'}
        </TaraText>
      </View>
      {loaded === 'missing' ? (
        <View style={styles.missing}>
          <TaraText variant="section">Alimento non trovato</TaraText>
          <Button label="Torna indietro" kind="secondary" onPress={() => router.back()} />
        </View>
      ) : loaded ? (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            testID="nuovo-alimento"
          >
            <View style={styles.names}>
              <View style={styles.name}>
                <TextField
                  label="Nome"
                  value={name}
                  onChangeText={setName}
                  invalid={shown.name !== undefined}
                  autoCapitalize="sentences"
                  autoFocus={editing === undefined && params.name === undefined}
                  testID="campo-nome"
                />
                {shown.name ? (
                  <TaraText variant="caption" color="error">
                    {shown.name}
                  </TaraText>
                ) : null}
              </View>
              <View style={styles.brand}>
                <TextField
                  label="Marca"
                  value={brand}
                  onChangeText={setBrand}
                  autoCapitalize="words"
                  placeholder="facoltativa"
                  testID="campo-marca"
                />
              </View>
            </View>

            <Segmented
              label="Si pesa"
              options={STATES}
              selectedKey={state}
              onSelect={(key) => setState(key as FoodState)}
            />
            <Segmented
              label="Valori"
              options={UNITS}
              selectedKey={unit}
              onSelect={(key) => setUnit(key as BaseUnit)}
            />

            <LabelForm
              unit={unit}
              texts={texts}
              errors={shown}
              values={form.values}
              onChange={(code, text) => setTexts((previous) => ({ ...previous, [code]: text }))}
            />

            {shown.total ? (
              <TaraText color="error" accessibilityLiveRegion="polite">
                {shown.total}
              </TaraText>
            ) : check ? (
              <View style={styles.check} accessibilityLiveRegion="polite">
                <Icon
                  name={check.ok ? 'check' : 'alert'}
                  color={check.ok ? 'text' : 'review'}
                  size={20}
                />
                <TaraText color={check.ok ? 'textSecondary' : 'review'} style={styles.checkText}>
                  {check.text}
                </TaraText>
              </View>
            ) : null}
            {form.values.sodium_mg !== undefined ? (
              <TaraText variant="caption" color="textSecondary">
                Sodio {formatNumber(form.values.sodium_mg, 0)} mg, calcolato dal sale.
              </TaraText>
            ) : null}

            {editing !== undefined ? (
              <Button label="Elimina alimento" kind="quiet" onPress={confirmDelete} />
            ) : null}
          </ScrollView>
          <View
            style={[
              styles.actions,
              { paddingBottom: space.l + insets.bottom, borderTopColor: colors.border },
            ]}
          >
            <Button
              label={editing ? 'Salva le modifiche' : 'Salva nel mio catalogo'}
              onPress={() => void save()}
              loading={saving}
              testID="salva-alimento"
            />
          </View>
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
  names: { flexDirection: 'row', gap: space.m },
  name: { flex: 3, gap: space.xs },
  brand: { flex: 2 },
  check: { flexDirection: 'row', gap: space.s, alignItems: 'flex-start' },
  checkText: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.l },
  actions: {
    paddingHorizontal: space.l,
    paddingTop: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
