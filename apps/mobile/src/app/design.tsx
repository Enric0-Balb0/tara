import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GramSheet, type SheetFood } from '@/components/GramSheet';
import { MacroRuler } from '@/components/MacroRuler';
import { NutritionLabel } from '@/components/NutritionLabel';
import { PressableScale } from '@/components/PressableScale';
import { ResultRow } from '@/components/ResultRow';
import { SearchDock } from '@/components/SearchDock';
import { TaraText } from '@/components/TaraText';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

// Albume d'uovo di CIQUAL 2025, per 100 g; i nutrienti assenti mostrano il trattino.
const EGG_WHITE: Record<'raw' | 'cooked', SheetFood> = {
  raw: {
    name: "Albume d'uovo",
    state: 'raw',
    per100: { energy_kcal: 48.1, protein_g: 10.9, carbs_g: 0.73, fat_g: 0.17 },
  },
  cooked: {
    name: "Albume d'uovo",
    state: 'cooked',
    per100: { energy_kcal: 47.3, protein_g: 10.3, carbs_g: 1.12, fat_g: 0.17 },
  },
};

const LONG_NAME =
  'Insalata di pasta al prosciutto crudo, formaggio e verdure crude, con salsa, pronta';

/** Catalogo dei componenti, solo in sviluppo: si apre con tara://design. */
export default function DesignScreen() {
  const { colors } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [state, setState] = useState<'raw' | 'cooked'>('raw');

  if (!__DEV__) return <Redirect href="/" />;

  const food = EGG_WHITE[state];
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <TaraText variant="title">Componenti</TaraText>

        <View>
          <ResultRow
            name="Albume d'uovo"
            state="raw"
            kcalPer100={48.1}
            proteinPer100={10.9}
            onPress={() => setSheetOpen(true)}
          />
          <ResultRow
            name="Albume d'uovo"
            state="cooked"
            kcalPer100={47.3}
            proteinPer100={10.3}
            onPress={() => setSheetOpen(true)}
          />
          <ResultRow
            name={LONG_NAME}
            state="not_applicable"
            kcalPer100={null}
            proteinPer100={null}
            onPress={() => undefined}
          />
        </View>

        <View
          style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <MacroRuler macro="protein" label="Proteine" logged={120} target={240} />
          <MacroRuler macro="carbs" label="Carboidrati" logged={49} planned={191} target={240} />
          <MacroRuler macro="fat" label="Grassi" logged={300} target={240} />
        </View>

        <NutritionLabel per100={EGG_WHITE.raw.per100} />

        <PressableScale
          onPress={() => setSheetOpen(true)}
          style={[styles.button, { backgroundColor: colors.action }]}
        >
          <TaraText variant="bodyStrong" color="background">
            Apri il foglio dei grammi
          </TaraText>
        </PressableScale>

        <PressableScale
          onPress={() => setCalcOpen(true)}
          style={[styles.button, { borderColor: colors.borderStrong, borderWidth: 1 }]}
        >
          <TaraText variant="bodyStrong">Foglio solo calcolo</TaraText>
        </PressableScale>
      </ScrollView>

      <SearchDock onSearch={() => setSheetOpen(true)} onScan={() => undefined} />

      <GramSheet
        visible={sheetOpen}
        food={food}
        mealName="Cena"
        lastGrams={500}
        onConfirm={() => setSheetOpen(false)}
        onConfirmAndContinue={() => undefined}
        onClose={() => setSheetOpen(false)}
        onChangeState={setState}
      />

      {/* In F0 la scheda alimento calcola soltanto: niente pasto né "Aggiungi e continua". */}
      <GramSheet
        visible={calcOpen}
        food={EGG_WHITE.raw}
        confirmVerb="Usa"
        onConfirm={() => setCalcOpen(false)}
        onClose={() => setCalcOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.l, gap: space.xl },
  panel: { borderRadius: radius.panel, borderWidth: 1, padding: space.l, gap: space.m },
  button: {
    height: touch.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
