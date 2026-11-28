import { useWindowDimensions } from 'react-native';

import { entryColumns } from '@/theme/layout';

/**
 * Le colonne di peso, kcal e proteine alla dimensione del testo scelta nel telefono: la stessa
 * fonte per voci, voci previste, totali e legenda del pasto, così restano allineate.
 */
export function useEntryColumns(): ReturnType<typeof entryColumns> {
  const { fontScale } = useWindowDimensions();
  return entryColumns(fontScale);
}
