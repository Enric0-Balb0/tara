import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { DayTypeCard } from '@/components/DayTypeCard';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { TaraText } from '@/components/TaraText';
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
import { toLocalDate } from '@/domain/diary';
import type { MacroTargets } from '@/domain/targets';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

interface Loaded {
  types: DayType[];
  targets: Record<string, DayTarget | undefined>;
}

/**
 * Piano (RF-50, RF-53): i tipi di giornata con i loro target. Un target cambiato vale da oggi:
 * i giorni passati restano confrontati con il loro. Pasti e grammi del piano arrivano con
 * RF-130.
 */
export default function PlanScreen() {
  const db: SqlDatabase = useSQLiteContext();
  const { session } = useSession();
  const userId = session?.user.id;
  const { colors } = useTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (userId === undefined) return;
    const request = ++latest.current;
    const today = toLocalDate(new Date());
    try {
      const types = await ensureDayTypes(db, userId, new Date());
      const targets: Loaded['targets'] = {};
      for (const type of types) targets[type.id] = await targetOn(db, userId, type.id, today);
      if (request === latest.current) setLoaded({ types, targets });
    } catch (error: unknown) {
      console.error('Piano non letto', error);
    }
  }, [db, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function save(type: DayType, name: string, values: MacroTargets) {
    if (userId === undefined) return;
    const now = new Date();
    try {
      if (name !== type.name) await renameDayType(db, userId, type.id, name, now);
      await setTarget(db, userId, type.id, toLocalDate(now), values, now);
    } catch (error: unknown) {
      console.error('Target non salvato', error);
      Alert.alert('Target non salvato', 'Il telefono non è riuscito a salvarlo. Riprova.');
      return;
    }
    await load();
  }

  function remove(type: DayType, first: DayType | undefined) {
    if (userId === undefined) return;
    Alert.alert(
      `Eliminare ${type.name}?`,
      first && first.id !== type.id
        ? `I giorni segnati come ${type.name} passano a ${first.name}. Il diario resta com'è.`
        : "Il diario resta com'è.",
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () =>
            void deleteDayType(db, userId, type.id, new Date())
              .then(load)
              .catch((error: unknown) => console.error('Tipo non eliminato', error)),
        },
      ],
    );
  }

  async function add() {
    if (userId === undefined) return;
    try {
      await addDayType(db, userId, 'Nuovo tipo', new Date());
    } catch (error: unknown) {
      console.error('Tipo non aggiunto', error);
      return;
    }
    await load();
  }

  if (loaded === null) return <View style={styles.screen} />;
  const first = loaded.types[0];

  return (
    <ScrollView
      testID="piano"
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.intro}>
        <TaraText variant="section" accessibilityRole="header">
          Target per tipo di giornata
        </TaraText>
        <TaraText variant="caption" color="textSecondary">
          Un target cambiato vale da oggi: i giorni passati restano con il loro. Un campo vuoto è un
          target non impostato.
        </TaraText>
      </View>
      {loaded.types.map((type, index) => {
        const target = loaded.targets[type.id];
        return (
          <DayTypeCard
            // Rimonta la scheda quando arriva un target diverso, così i campi ripartono da lì.
            key={`${type.id}:${target?.id ?? 'nessuno'}:${target?.validFrom ?? ''}:${type.name}`}
            testID={`tipo-${index}`}
            name={type.name}
            target={target}
            canDelete={loaded.types.length > 1}
            onSave={(name, values) => save(type, name, values)}
            onDelete={() => remove(type, first)}
          />
        );
      })}
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
