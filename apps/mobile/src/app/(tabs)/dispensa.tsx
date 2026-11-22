import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PressableScale } from '@/components/PressableScale';
import { StateTag } from '@/components/StateTag';
import { TaraText } from '@/components/TaraText';
import { type PersonalFood, personalFoods } from '@/data/foodsStore';
import { startDraft } from '@/data/recipeDraft';
import { type RecipeListItem, recipes } from '@/data/recipesStore';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import { formatAmount } from '@/domain/format';
import { space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

/**
 * Dispensa: il catalogo personale (RF-02, RF-18). I prodotti inseriti qui si trovano nella
 * ricerca come i generici; le ricette (RF-20) stanno nella loro sezione, i pasti salvati
 * arriveranno accanto.
 */
export default function PantryScreen() {
  const db: SqlDatabase = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;
  // undefined: si sta leggendo.
  const [foods, setFoods] = useState<PersonalFood[] | undefined>(undefined);
  const [recipeList, setRecipeList] = useState<RecipeListItem[]>([]);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (userId === undefined) return undefined;
      let current = true;
      void Promise.all([personalFoods(db, userId), recipes(db, userId)])
        .then(([list, recipeRows]) => {
          if (!current) return;
          setFoods(list);
          setRecipeList(recipeRows);
          setFailed(false);
        })
        .catch((error: unknown) => {
          console.error('Dispensa non letta', error);
          if (!current) return;
          setFoods([]);
          setRecipeList([]);
          setFailed(true);
        });
      return () => {
        current = false;
      };
    }, [db, userId]),
  );

  const sections = [
    ...(recipeList.length > 0 ? [{ key: 'ricette', title: 'Ricette', data: recipeList }] : []),
    ...(foods && foods.length > 0
      ? [{ key: 'alimenti', title: 'I tuoi alimenti', data: foods }]
      : []),
  ];

  return (
    <SectionList<PersonalFood | RecipeListItem>
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(item) => item.id}
      testID="dispensa"
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={styles.buttons}>
          <View style={styles.button}>
            <Button label="Nuovo alimento" onPress={() => router.push('/nuovo-alimento')} />
          </View>
          <View style={styles.button}>
            <Button
              label="Nuova ricetta"
              kind="secondary"
              testID="nuova-ricetta"
              onPress={() => {
                // La bozza riparte vuota qui, senza contare sulla pulizia dell'editor.
                startDraft();
                router.push('/ricetta');
              }}
            />
          </View>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <TaraText variant="bodyStrong" accessibilityRole="header" style={styles.section}>
          {section.title}
        </TaraText>
      )}
      ListEmptyComponent={
        foods ? (
          <TaraText color="textSecondary" style={styles.empty}>
            {failed
              ? 'Il telefono non è riuscito a leggere i tuoi alimenti: riprova tornando qui.'
              : "Qui trovi i prodotti che inserisci tu e le tue ricette: copi l'etichetta una volta, poi li cerchi come tutti gli altri."}
          </TaraText>
        ) : undefined
      }
      renderItem={({ item, section }) => {
        const isRecipe = section.key === 'ricette';
        const recipeItem = item as RecipeListItem;
        const food = item as PersonalFood;
        const kcal = formatAmount(isRecipe ? recipeItem.kcalPer100 : food.kcal, 'kcal');
        const servingText =
          isRecipe && recipeItem.servingG !== null
            ? formatAmount(recipeItem.servingG, 'grams')
            : null;
        const serving = servingText === null ? null : `porzione ${servingText} g`;
        const unit = isRecipe ? 'g' : food.baseUnit;
        return (
          <PressableScale
            onPress={() => router.push({ pathname: '/alimento/[id]', params: { id: item.id } })}
            accessibilityLabel={
              isRecipe
                ? `${recipeItem.name}, ricetta, ${kcal} kcal per 100 grammi${servingText ? `, porzione di ${servingText} grammi` : ''}`
                : `${food.name}${food.brand ? `, ${food.brand}` : ''}, ${kcal} kcal per 100 ${food.baseUnit === 'ml' ? 'millilitri' : 'grammi'}`
            }
            style={[styles.row, { borderBottomColor: colors.border }]}
          >
            <View style={styles.text}>
              <View style={styles.name}>
                <TaraText numberOfLines={2} style={styles.shrink}>
                  {item.name}
                </TaraText>
                {isRecipe ? null : <StateTag state={food.state} />}
              </View>
              {!isRecipe && food.brand ? (
                <TaraText variant="minimum" color="textSecondary" numberOfLines={1}>
                  {food.brand}
                </TaraText>
              ) : null}
              {serving ? (
                <TaraText variant="minimum" color="textSecondary" numberOfLines={1}>
                  {serving}
                </TaraText>
              ) : null}
            </View>
            <View style={styles.value}>
              <TaraText variant="number">{kcal}</TaraText>
              <TaraText variant="minimum" color="textSecondary">
                kcal/100 {unit}
              </TaraText>
            </View>
          </PressableScale>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl },
  buttons: { flexDirection: 'row', gap: space.s, padding: space.l },
  button: { flex: 1 },
  section: { paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: space.s },
  empty: { paddingHorizontal: space.l },
  row: {
    minHeight: touch.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1 },
  name: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  shrink: { flexShrink: 1 },
  value: { alignItems: 'flex-end' },
});
