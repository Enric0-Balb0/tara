import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { type DiaryNutrient, formatTotal, type Total } from '@/domain/diary';
import { formatAmount } from '@/domain/format';
import { goalFigures, type MacroTargets, remaining, remainingText } from '@/domain/targets';
import { proteinPerKgText } from '@/domain/weight';
import type { MacroToken } from '@/theme/colors';
import {
  fitColumn,
  goalColumns,
  goals,
  goalsCard,
  radius,
  space,
  verticalSlop,
} from '@/theme/layout';
import { ruler } from '@/theme/ruler';
import { textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

import { DayTotals } from './DayTotals';
import { GoalBar } from './GoalBar';
import { PressableScale } from './PressableScale';
import { TaraText } from './TaraText';

const MACROS: readonly {
  code: Exclude<DiaryNutrient, 'energy_kcal'>;
  label: string;
  token: MacroToken;
}[] = [
  { code: 'protein_g', label: 'Proteine', token: 'protein' },
  { code: 'carbs_g', label: 'Carboidrati', token: 'carbs' },
  { code: 'fat_g', label: 'Grassi', token: 'fat' },
];

const SWATCH = { width: 14, height: 6 } as const;
// L'invito al Piano è una riga di didascalia: il tocco arriva a 44 con hitSlop, senza fascia vuota.
const LINK_SLOP = verticalSlop(textStyles.caption.lineHeight);
// Sotto questa larghezza la barra non si legge più: il valore va a capo, sotto la barra.
const BAR_MIN = space.xxxl;

/**
 * Le colonne delle righe degli obiettivi, uguali per i macro e per l'acqua: crescono con il
 * testo del telefono, e la colonna dei valori si allarga al valore più largo. Ogni riga misura
 * il suo valore con `measure(chiave)`.
 */
interface GoalColumns {
  label: number;
  value: number;
  measure: (key: string) => (event: LayoutChangeEvent) => void;
}

const GoalColumnsContext = createContext<GoalColumns>({
  label: goals.label,
  value: goals.value,
  measure: () => () => undefined,
});

/** Le colonne della scheda degli obiettivi in cui sta la riga (l'acqua). */
export function useGoalColumns(): GoalColumns {
  return useContext(GoalColumnsContext);
}

/** La chiave con cui la riga dell'acqua misura il suo valore. */
export const WATER_KEY = 'water';

interface Props {
  totals: Record<DiaryNutrient, Total>;
  /** Ancora previsto dal piano: tratteggio nelle barre (RF-130). */
  planned?: Record<DiaryNutrient, Total>;
  /** Il target in vigore quel giorno per il tipo di giornata; undefined se non c'è. */
  target: MacroTargets | undefined;
  /** Per il lettore dello schermo: di base "Obiettivi della giornata". */
  label?: string;
  dayTypeName?: string;
  /** Senza, niente invito al Piano quando manca il target (nel Piano stesso). */
  onSetTargets?: () => void;
  /** Media mobile del peso alla data mostrata, per le proteine in g/kg (RF-57); null senza pesate. */
  averageKg?: number | null;
  /** Righe in fondo alla scheda, dopo un separatore: in Oggi l'acqua. */
  children?: ReactNode;
  /** Il giorno dei totali: cambiandolo le barre saltano al valore nuovo, senza passaggio. */
  day?: string;
}

function hasAnyTarget(target: MacroTargets | undefined): target is MacroTargets {
  return (
    target !== undefined &&
    [target.kcal, target.protein_g, target.carbs_g, target.fat_g].some((value) => value !== null)
  );
}

/**
 * Obiettivi della giornata (RF-45, RF-50) in una scheda compatta: in prima riga le kcal contro
 * il target con quanto manca, poi una riga per macro (nome colorato | barra sottile | "49 /
 * 240"), la legenda se c'è un piano e in fondo le righe di `children` (l'acqua). Senza target i
 * totali in una riga e l'invito al Piano.
 */
export function DayGoals({
  totals,
  planned,
  target,
  label = 'Obiettivi della giornata',
  dayTypeName,
  onSetTargets,
  averageKg = null,
  children,
  day,
}: Props) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const base = goalColumns(fontScale);
  const [widths, setWidths] = useState<Readonly<Record<string, number>>>({});
  const measure = useCallback(
    (key: string) => (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      setWidths((current) => (current[key] === width ? current : { ...current, [key]: width }));
    },
    [],
  );
  const withTargets = hasAnyTarget(target);
  // Contano solo le righe in vista: senza target resta il valore dell'acqua.
  const shownKeys: string[] = withTargets
    ? [...MACROS.map((macro) => macro.code), WATER_KEY]
    : [WATER_KEY];
  const shownWidths = shownKeys.flatMap((key) => {
    const width = widths[key];
    return width === undefined ? [] : [width];
  });
  const goalColumnsValue: GoalColumns = {
    label: base.label,
    value: fitColumn(base.value, shownWidths),
    measure,
  };
  const perKg = proteinPerKgText(totals.protein_g.amount, totals.protein_g.incomplete, averageKg);
  const proteinNote = perKg === null ? undefined : { ...perKg, testID: 'proteine-per-kg' };
  const plannedKcal = planned?.energy_kcal.amount ?? 0;
  const footer =
    children === undefined || children === null ? null : (
      <View style={[styles.footer, { borderColor: colors.border }]}>
        <GoalColumnsContext.Provider value={goalColumnsValue}>
          {children}
        </GoalColumnsContext.Provider>
      </View>
    );

  if (!withTargets) {
    return (
      <View
        accessibilityLabel={label}
        style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <DayTotals totals={totals} proteinNote={proteinNote} />
        {plannedKcal > 0 ? (
          <TaraText variant="caption" color="textSecondary">
            Previste dal piano: {formatAmount(plannedKcal, 'kcal')} kcal
          </TaraText>
        ) : null}
        {onSetTargets ? (
          <PressableScale onPress={onSetTargets} hitSlop={LINK_SLOP} style={styles.link}>
            <TaraText variant="caption" color="textSecondary">
              {dayTypeName
                ? `Nessun target per ${dayTypeName}: impostalo nel Piano`
                : 'Nessun target: impostalo nel Piano'}
            </TaraText>
          </PressableScale>
        ) : null}
        {footer}
      </View>
    );
  }

  const kcal = totals.energy_kcal;
  // Un target con i macro ma senza kcal: le kcal si mostrano da sole, senza "/ –".
  const kcalFigures = goalFigures(
    formatTotal(kcal, 'kcal'),
    target.kcal === null ? null : formatAmount(target.kcal, 'kcal'),
    'kcal',
    'omit',
  );
  const left = remaining(target.kcal, kcal.amount);
  const leftText =
    [
      remainingText(left, 'kcal'),
      plannedKcal > 0 ? `previste ${formatAmount(plannedKcal, 'kcal')}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null;
  const incomplete = Object.values(totals).some((total) => total.incomplete);
  const anyPlanned = MACROS.some((macro) => (planned?.[macro.code].amount ?? 0) > 0);
  return (
    <View
      accessibilityLabel={label}
      style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View
        accessible
        accessibilityLabel={`${formatTotal(kcal, 'kcal')} kcal${target.kcal === null ? '' : ` di ${formatAmount(target.kcal, 'kcal')}`}${leftText ? `, ${leftText}` : ''}`}
        style={styles.kcalRow}
      >
        <TaraText color="textSecondary" numberOfLines={1} style={styles.kcal}>
          <TaraText variant="figure">{kcalFigures.value}</TaraText>
          {kcalFigures.rest}
        </TaraText>
        {/* Con il testo grande va su due righe, a destra, invece di tagliarsi. */}
        {leftText === null ? null : (
          <TaraText
            variant="caption"
            color={left !== null && left < 0 ? 'error' : 'textSecondary'}
            style={styles.left}
          >
            {leftText}
          </TaraText>
        )}
      </View>
      {MACROS.map((macro) => {
        const logged = totals[macro.code];
        const plannedAmount = planned?.[macro.code].amount ?? 0;
        const macroTarget = target[macro.code];
        const figures = goalFigures(
          formatTotal(logged, 'macro'),
          macroTarget === null ? null : formatAmount(macroTarget, 'grams'),
        );
        const targetSpoken = macroTarget === null ? '–' : formatAmount(macroTarget, 'grams');
        const plannedSpoken =
          plannedAmount > 0 ? `, ${formatAmount(plannedAmount, 'grams')} previsti dal piano` : '';
        const note = macro.code === 'protein_g' ? proteinNote : undefined;
        return (
          <View
            key={macro.code}
            accessible
            accessibilityLabel={`${macro.label} ${formatAmount(logged.amount, 'grams')} di ${targetSpoken} grammi${plannedSpoken}${note ? `, ${note.spoken}` : ''}`}
            style={styles.row}
          >
            <View style={{ width: goalColumnsValue.label }}>
              <TaraText
                variant="bodyStrong"
                color={macro.token}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {macro.label}
              </TaraText>
              {note ? (
                <TaraText
                  testID={note.testID}
                  variant="minimum"
                  color="textSecondary"
                  numberOfLines={1}
                >
                  {note.text}
                </TaraText>
              ) : null}
            </View>
            <View style={styles.bar}>
              <GoalBar
                color={macro.token}
                logged={logged.amount}
                planned={plannedAmount}
                target={macroTarget}
                day={day}
              />
            </View>
            <GoalValue
              width={goalColumnsValue.value}
              onMeasure={measure(macro.code)}
              value={figures.value}
              rest={figures.rest}
            />
          </View>
        );
      })}
      {anyPlanned ? <Legend /> : null}
      {incomplete ? (
        <TaraText variant="caption" color="textSecondary">
          Alcune voci non hanno tutti i valori: i totali sono un minimo.
        </TaraText>
      ) : null}
      {footer}
    </View>
  );
}

/**
 * Il valore di una riga degli obiettivi, "**49** / 240", nella colonna dei valori: allineato a
 * destra, mai rimpicciolito. Misura la sua larghezza vera, che allarga la colonna se serve.
 */
export function GoalValue({
  width,
  onMeasure,
  value,
  rest,
  testID,
  accessibilityLabel,
}: {
  width: number;
  onMeasure: (event: LayoutChangeEvent) => void;
  value: string;
  rest: string;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <View style={[styles.value, { minWidth: width }]}>
      <TaraText
        testID={testID}
        color="textSecondary"
        numberOfLines={1}
        accessibilityLabel={accessibilityLabel}
        onLayout={onMeasure}
      >
        <TaraText variant="figure">{value}</TaraText>
        {rest}
      </TaraText>
    </View>
  );
}

/** "registrato · previsto": il pieno e il tratteggio delle barre. Le righe lo dicono già a voce. */
function Legend() {
  const { colors } = useTheme();
  const hatch = [0, 4, 8, 12, 16];
  return (
    <View
      style={styles.legend}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.legendItem}>
        <View style={[styles.swatch, { backgroundColor: colors.text }]} />
        <TaraText variant="minimum" color="textSecondary">
          registrato
        </TaraText>
      </View>
      <View style={styles.legendItem}>
        <Svg width={SWATCH.width} height={SWATCH.height}>
          {hatch.map((x) => (
            <Line
              key={x}
              x1={x - SWATCH.height}
              y1={SWATCH.height}
              x2={x}
              y2={0}
              stroke={colors.textSecondary}
              strokeWidth={ruler.hatchWidth}
            />
          ))}
        </Svg>
        <TaraText variant="minimum" color="textSecondary">
          previsto
        </TaraText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start' },
  panel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingTop: goalsCard.paddingTop,
    paddingBottom: goalsCard.paddingBottom,
    gap: goalsCard.rowGap,
  },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.s },
  kcal: { flexShrink: 0 },
  left: { flexGrow: 1, flexShrink: 1, textAlign: 'right' },
  // Se nome, barra e valore non stanno in una riga, il valore va sotto, a destra.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: goals.gap,
    rowGap: space.xs,
  },
  bar: { flex: 1, minWidth: BAR_MIN },
  value: { marginLeft: 'auto', alignItems: 'flex-end' },
  legend: { flexDirection: 'row', gap: space.l },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  swatch: { width: SWATCH.width, height: SWATCH.height, borderRadius: SWATCH.height / 2 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.m },
});
