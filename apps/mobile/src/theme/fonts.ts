import type { FontFamily } from './typography';

/** File dei caratteri, caricati all'avvio con `useFonts` (generati da `npm run fonts`). */
export const FONT_FILES: Record<FontFamily, number> = {
  'Archivo-Regular': require('../../assets/fonts/Archivo-Regular.ttf'),
  'Archivo-SemiBold': require('../../assets/fonts/Archivo-SemiBold.ttf'),
  'Archivo-Bold': require('../../assets/fonts/Archivo-Bold.ttf'),
  'ArchivoSemiExpanded-SemiBold': require('../../assets/fonts/ArchivoSemiExpanded-SemiBold.ttf'),
  'ArchivoSemiExpanded-ExtraBold': require('../../assets/fonts/ArchivoSemiExpanded-ExtraBold.ttf'),
  'ArchivoExpanded-Bold': require('../../assets/fonts/ArchivoExpanded-Bold.ttf'),
  'ArchivoExpanded-ExtraBold': require('../../assets/fonts/ArchivoExpanded-ExtraBold.ttf'),
};
