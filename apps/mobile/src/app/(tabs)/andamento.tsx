import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PressableScale } from '@/components/PressableScale';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TaraText } from '@/components/TaraText';
import { WeightChart } from '@/components/WeightChart';
import { WeightSheet } from '@/components/WeightSheet';
import { useSession } from '@/data/SessionProvider';
import type { SqlDatabase } from '@/data/sql';
import { deleteWeight, latestWeights, setWeight, weights } from '@/data/weightStore';
import { addDays, dayLabel, toLocalDate } from '@/domain/diary';
import { formatNumber } from '@/domain/format';
import {
  chartSeries,
  formatChange,
  movingAverage,
  type WeightPoint,
  weeklyChange,
} from '@/domain/weight';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

const CHART_DAYS = 30;
const LIST_SIZE = 14;
// Il grafico parte 29 giorni prima, e la media del primo giorno guarda altri 6 indietro.
const HISTORY_DAYS = CHART_DAYS - 1 + 6;

const kgText = (kg: number) => `${formatNumber(kg, 1)} kg`;
const kgSpoken = (kg: number) => `${formatNumber(kg, 1)} chili`;

/**
 * Andamento (RF-70): peso di oggi, media mobile a 7 giorni, variazione settimanale, grafico
 * degli ultimi 30 giorni e le ultime pesate, da correggere o eliminare con un tocco.
 */
export default function TrendScreen() {
  const db: SqlDatabase = useSQLiteContext();
  const { session } = useSession();
  const userId = session?.user.id;
  const { colors } = useTheme();
  const [today, setToday] = useState(() => toLocalDate(new Date()));
  const [recent, setRecent] = useState<WeightPoint[]>([]);
  const [latest, setLatest] = useState<WeightPoint[]>([]);
  // Il giorno della pesata che si sta scrivendo o correggendo.
  const [editing, setEditing] = useState<{ date: string; kg?: number } | null>(null);
  const saving = useRef(false);

  const load = useCallback(async () => {
    if (userId === undefined) return;
    const now = toLocalDate(new Date());
    try {
      const [range, last] = await Promise.all([
        weights(db, userId, addDays(now, -HISTORY_DAYS), now),
        latestWeights(db, userId, LIST_SIZE),
      ]);
      setToday(now);
      setRecent(range);
      setLatest(last);
    } catch (error: unknown) {
      console.error('Pesate non lette', error);
    }
  }, [db, userId]);

  // Dopo mezzanotte, con l'app rimasta aperta, "oggi" va avanti.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Una scrittura alla volta; il foglio si chiude solo se riesce.
  async function write(change: (owner: string) => Promise<unknown>) {
    if (userId === undefined || saving.current) return;
    saving.current = true;
    try {
      await change(userId);
      setEditing(null);
    } catch (error: unknown) {
      console.error('Peso non salvato', error);
      Alert.alert('Peso non salvato', 'Il telefono non è riuscito a salvarlo. Riprova.');
    } finally {
      saving.current = false;
    }
    await load();
  }

  const todayWeight = recent.find((entry) => entry.date === today)?.kg;
  const average = movingAverage(recent, today);
  const change = weeklyChange(recent, today);
  const series = chartSeries(recent, today, CHART_DAYS);
  const first = series.points[0];
  const last = series.points.at(-1);
  const range = first && last ? `, da ${kgSpoken(first.kg)} a ${kgSpoken(last.kg)}` : '';

  return (
    <View style={styles.screen}>
      <View
        importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={editing !== null}
      >
        <ScreenHeader title="Andamento" />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={editing !== null}
      >
        <View
          testID="peso-pannello"
          style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <TaraText variant="caption" color="textSecondary">
            Peso di oggi
          </TaraText>
          {todayWeight === undefined ? (
            <Button
              label="Pesati"
              onPress={() => setEditing({ date: toLocalDate(new Date()) })}
              accessibilityLabel="Pesati: registra il peso di oggi"
              testID="pesati"
            />
          ) : (
            <PressableScale
              testID="peso-oggi"
              onPress={() => setEditing({ date: toLocalDate(new Date()), kg: todayWeight })}
              accessibilityLabel={`Peso di oggi ${kgSpoken(todayWeight)}, tocca per modificarlo`}
              style={styles.todayValue}
            >
              <TaraText variant="readout">{kgText(todayWeight)}</TaraText>
            </PressableScale>
          )}
          {average === null ? null : (
            <TaraText testID="media-7-giorni" variant="bodyStrong">
              {`Media 7 giorni ${kgText(average)}`}
            </TaraText>
          )}
          {change === null ? null : (
            <TaraText testID="variazione-settimanale" color="textSecondary">
              {formatChange(change)}
            </TaraText>
          )}
        </View>

        <View style={styles.section}>
          <TaraText variant="section" accessibilityRole="header">
            Ultimi 30 giorni
          </TaraText>
          {series.points.length === 0 ? (
            <TaraText color="textSecondary">Il grafico compare con la prima pesata.</TaraText>
          ) : (
            <>
              <WeightChart
                series={series}
                days={CHART_DAYS}
                accessibilityLabel={`Grafico del peso degli ultimi 30 giorni: ${series.points.length} pesate${range}`}
              />
              <View style={styles.legend}>
                <TaraText variant="minimum" color="textSecondary">
                  Punti: pesate. Linea: media 7 giorni.
                </TaraText>
              </View>
            </>
          )}
        </View>

        {latest.length === 0 ? null : (
          <View style={styles.section}>
            <TaraText variant="section" accessibilityRole="header">
              Ultime pesate
            </TaraText>
            {latest.map((entry) => (
              <PressableScale
                key={entry.date}
                onPress={() => setEditing({ date: entry.date, kg: entry.kg })}
                accessibilityLabel={`${dayLabel(entry.date)}, ${kgSpoken(entry.kg)}, tocca per modificare`}
                style={[styles.row, { borderColor: colors.border }]}
              >
                <TaraText>{dayLabel(entry.date)}</TaraText>
                <TaraText variant="number">{kgText(entry.kg)}</TaraText>
              </PressableScale>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={editing !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setEditing(null)}
      >
        {editing ? (
          <WeightSheet
            visible
            title={editing.date === today ? 'Peso di oggi' : dayLabel(editing.date)}
            startKg={editing.kg}
            onConfirm={(kg) =>
              void write((owner) => setWeight(db, owner, editing.date, kg, new Date()))
            }
            onDelete={
              editing.kg === undefined
                ? undefined
                : () => void write((owner) => deleteWeight(db, owner, editing.date, new Date()))
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
  panel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    gap: space.s,
  },
  todayValue: { minHeight: touch.min, justifyContent: 'center' },
  section: { gap: space.s },
  legend: { alignItems: 'flex-end' },
  row: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
});
