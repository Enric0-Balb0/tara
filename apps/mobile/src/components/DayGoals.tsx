import { StyleSheet, View } from 'react-native';

import { type DiaryNutrient, formatTotal, type Total } from '@/domain/diary';
import { formatAmount } from '@/domain/format';
import { type MacroTargets, remaining, remainingText } from '@/domain/targets';
import type { MacroToken } from '@/theme/colors';
import { radius, space, touch } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { DayTotals } from './DayTotals';
import { MacroRuler } from './MacroRuler';
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

interface Props {
  totals: Record<DiaryNutrient, Total>;
  /** Il target in vigore quel giorno per il tipo di giornata; undefined se non c'è. */
  target: MacroTargets | undefined;
  dayTypeName: string | undefined;
  onSetTargets: () => void;
}

function hasAnyTarget(target: MacroTargets | undefined): target is MacroTargets {
  return (
    target !== undefined &&
    [target.kcal, target.protein_g, target.carbs_g, target.fat_g].some((value) => value !== null)
  );
}

/**
 * Obiettivi della giornata (RF-45, RF-50): kcal registrate contro il target con quanto manca,
 * e una barra graduata per macro. Senza target restano i totali, con l'invito a impostarli.
 */
export function DayGoals({ totals, target, dayTypeName, onSetTargets }: Props) {
  const { colors } = useTheme();
  if (!hasAnyTarget(target)) {
    return (
      <View style={styles.stack}>
        <DayTotals totals={totals} />
        <PressableScale onPress={onSetTargets} style={styles.link}>
          <TaraText variant="caption" color="textSecondary">
            {dayTypeName
              ? `Nessun target per ${dayTypeName}: impostalo nel Piano`
              : 'Nessun target: impostalo nel Piano'}
          </TaraText>
        </PressableScale>
      </View>
    );
  }

  const kcal = totals.energy_kcal;
  // Un target con i macro ma senza kcal: le kcal si mostrano da sole, senza "/ –".
  const kcalTarget = target.kcal === null ? '' : ` / ${formatAmount(target.kcal, 'kcal')}`;
  const left = remaining(target.kcal, kcal.amount);
  const leftText = remainingText(left, 'kcal');
  const incomplete = Object.values(totals).some((total) => total.incomplete);
  return (
    <View
      accessibilityLabel="Obiettivi della giornata"
      style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View
        accessible
        accessibilityLabel={`${formatTotal(kcal, 'kcal')} kcal${target.kcal === null ? '' : ` di ${formatAmount(target.kcal, 'kcal')}`}${leftText ? `, ${leftText}` : ''}`}
        style={styles.kcalRow}
      >
        <TaraText color="textSecondary">
          <TaraText variant="bigNumber">{formatTotal(kcal, 'kcal')}</TaraText>
          {kcalTarget} kcal
        </TaraText>
        {leftText === null ? null : (
          <TaraText variant="caption" color={left !== null && left < 0 ? 'error' : 'textSecondary'}>
            {leftText}
          </TaraText>
        )}
      </View>
      {MACROS.map((macro) => (
        <MacroRuler
          key={macro.code}
          macro={macro.token}
          label={macro.label}
          logged={totals[macro.code].amount}
          target={target[macro.code]}
        />
      ))}
      {incomplete ? (
        <TaraText variant="caption" color="textSecondary">
          Alcune voci non hanno tutti i valori: i totali sono un minimo.
        </TaraText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  link: { minHeight: touch.min, justifyContent: 'center', paddingHorizontal: space.xs },
  panel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    gap: space.m,
  },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
