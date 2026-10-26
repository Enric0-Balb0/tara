import { StyleSheet, View } from 'react-native';

import { space } from '@/theme/layout';
import { useTheme } from '@/theme/useTheme';

import { TaraText } from './TaraText';

interface Props {
  title: string;
  description: string;
}

/** Schermata provvisoria finché la funzione non viene implementata. */
export function ScreenPlaceholder({ title, description }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TaraText variant="section">{title}</TaraText>
      <TaraText color="textSecondary" style={styles.description}>
        {description}
      </TaraText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    gap: space.s,
  },
  description: { textAlign: 'center' },
});
