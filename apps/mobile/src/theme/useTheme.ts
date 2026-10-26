import { useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { type ColorToken, colors, type Scheme } from './colors';

export interface Theme {
  scheme: Scheme;
  colors: Record<ColorToken, string>;
  /** Movimento ridotto chiesto dal telefono: solo dissolvenze. */
  reduceMotion: boolean;
}

/** Tema corrente: il chiaro solo se il telefono lo chiede, altrimenti lo scuro. */
export function useTheme(): Theme {
  const scheme: Scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  return { scheme, colors: colors[scheme], reduceMotion: useReducedMotion() };
}
