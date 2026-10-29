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
import type { SqlDatabase } from '@/data/sql';
import { sourceLabel } from '@/domain/sources';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

/**
 * Scheda alimento: etichetta per 100 g con la fonte e il foglio dei grammi. In F0 il foglio
 * calcola soltanto: "Usa 200 g" riporta l'etichetta a 200 g, il diario arriva in F1.
 * L'intestazione nativa è nascosta perché il foglio copra tutta la schermata.
 */
export default function FoodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db: SqlDatabase = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  // undefined: si sta leggendo; null: l'alimento non c'è.
  const [food, setFood] = useState<FoodDetail | null | undefined>(undefined);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [usedGrams, setUsedGrams] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let current = true;
    void (async () => {
      const found = await getFood(db, id);
      const other =
        found && found.state !== 'not_applicable'
          ? await getVariant(db, found, found.state === 'raw' ? 'cooked' : 'raw')
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

  const grams = usedGrams ?? 100;
  const per100 = Object.fromEntries(food.nutrients.map((n) => [n.code, n.amountPer100]));
  const source = sourceLabel(food.source);

  return (
    <View style={screenStyle}>
      {back}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.title}>
          <TaraText variant="title">{food.name}</TaraText>
          <StateTag state={food.state} />
        </View>
        <NutritionLabel per100={per100} grams={grams} />
        {usedGrams !== null ? (
          <PressableScale
            onPress={() => setUsedGrams(null)}
            style={[styles.secondary, { borderColor: colors.borderStrong }]}
          >
            <TaraText variant="bodyStrong">Torna a 100 g</TaraText>
          </PressableScale>
        ) : null}
        {source !== null ? (
          <TaraText variant="caption" color="textSecondary">
            Fonte: {source}
          </TaraText>
        ) : null}
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: space.l + insets.bottom }]}>
        <PressableScale
          onPress={() => setSheetOpen(true)}
          style={[styles.primary, { backgroundColor: colors.action }]}
        >
          <TaraText variant="bodyStrong" color="background">
            Calcola per i tuoi grammi
          </TaraText>
        </PressableScale>
      </View>

      <GramSheet
        visible={sheetOpen}
        food={{ name: food.name, state: food.state, per100 }}
        lastGrams={usedGrams ?? undefined}
        confirmVerb="Usa"
        onConfirm={(confirmed) => {
          setUsedGrams(confirmed);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
        onChangeState={
          variantId === null
            ? undefined
            : (state) => {
                if (state !== food.state) router.setParams({ id: variantId });
              }
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  back: {
    width: touch.min,
    height: touch.min,
    marginLeft: space.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: space.l, gap: space.l },
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
  actions: { paddingHorizontal: space.l, paddingTop: space.m },
  primary: {
    minHeight: touch.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
