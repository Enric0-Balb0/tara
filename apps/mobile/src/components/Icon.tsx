import Svg, { Path } from 'react-native-svg';

import type { ColorToken } from '@/theme/colors';
import { useTheme } from '@/theme/useTheme';

// Un set unico: tratti da 2 su griglia 24, estremità arrotondate (docs/design.md, "Icone").
const ICONS = {
  search: ['M18 11a7 7 0 1 1-14 0a7 7 0 1 1 14 0', 'M20 20l-4-4'],
  scan: ['M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3', 'M8 9v6M11 9v6M14 9v6M17 9v6'],
  chevronLeft: ['M15 6l-6 6 6 6'],
  chevronRight: ['M9 6l6 6-6 6'],
  chevronDown: ['M6 9l6 6 6-6'],
  close: ['M6 6l12 12M18 6L6 18'],
  delete: ['M9 6h11v12H9l-6-6z', 'M12 10l4 4M16 10l-4 4'],
  check: ['M5 12l5 5 9-10'],
  alert: ['M12 4l9 16H3z', 'M12 10v4M12 17v.01'],
  today: [
    'M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
    'M4 10h16M9 3v4M15 3v4',
  ],
  plan: ['M5 4h14v16H5z', 'M9 9h6M9 13h6M9 17h3'],
  pantry: ['M7 3h10v4H7z', 'M6 7h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z', 'M9 12h6'],
  trend: ['M4 18l5-6 4 3 7-9'],
  profile: ['M16 8a4 4 0 1 1-8 0a4 4 0 1 1 8 0', 'M4 20c1.5-4 5-5 8-5s6.5 1 8 5'],
} as const;

export type IconName = keyof typeof ICONS;

interface Props {
  name: IconName;
  color: ColorToken;
  size?: number;
}

/** Icona decorativa: chi la usa da sola dà un'etichetta accessibile al pulsante. */
export function Icon({ name, color, size = 24 }: Props) {
  const { colors } = useTheme();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors[color]}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ICONS[name].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}
