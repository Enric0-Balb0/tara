import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { type DiaryNutrient, formatTotal, type Total } from '@/domain/diary';
import { formatAmount } from '@/domain/format';
import { goalFigures, type MacroTargets, remaining, remainingText } from '@/domain/targets';
import { proteinPerKgText } from '@/domain/weight';
import type { MacroToken } from '@/theme/colors';
import { goals, radius, space, touch } from '@/theme/layout';
import { ruler } from '@/theme/ruler';
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
}: Props) {
  const { colors } = useTheme();
  const perKg = proteinPerKgText(totals.protein_g.amount, totals.protein_g.incomplete, averageKg);
  const proteinNote = perKg === null ? undefined : { ...perKg, testID: 'proteine-per-kg' };
  const plannedKcal = planned?.energy_kcal.amount ?? 0;
  const footer =
    children === undefined || children === null ? null : (
      <View style={[styles.footer, { borderColor: colors.border }]}>{children}</View>
    );

  if (!hasAnyTarget(target)) {
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
          <PressableScale onPress={onSetTargets} style={styles.link}>
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
        <TaraText color="textSecondary" numberOfLines={1}>
          <TaraText variant="figure">{kcalFigures.value}</TaraText>
          {kcalFigures.rest}
        </TaraText>
        {leftText === null ? null : (
          <TaraText
            variant="caption"
            color={left !== null && left < 0 ? 'error' : 'textSecondary'}
            numberOfLines={1}
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
            <View style={styles.label}>
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
              />
            </View>
            <TaraText
              color="textSecondary"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.value}
            >
              <TaraText variant="figure">{figures.value}</TaraText>
              {figures.rest}
            </TaraText>
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
  link: { minHeight: touch.min, justifyContent: 'center' },
  panel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    gap: space.m,
  },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.s },
  left: { flex: 1, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', gap: goals.gap },
  label: { width: goals.label },
  bar: { flex: 1, minWidth: 0 },
  value: { width: goals.value, textAlign: 'right' },
  legend: { flexDirection: 'row', gap: space.l },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  swatch: { width: SWATCH.width, height: SWATCH.height, borderRadius: SWATCH.height / 2 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.m },
});
