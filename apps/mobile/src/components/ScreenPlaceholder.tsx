import { StyleSheet, Text, View } from 'react-native';

interface Props {
  title: string;
  description: string;
}

/** Schermata provvisoria finché la funzione non viene implementata. */
export function ScreenPlaceholder({ title, description }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.7,
  },
});
