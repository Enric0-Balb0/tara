import { describe, expect, it } from 'vitest';

import { textStyles } from './typography';

describe('textStyles', () => {
  it('segue la tabella "Carattere" di docs/design.md', () => {
    expect(textStyles).toEqual({
      readout: { fontFamily: 'ArchivoExpanded-ExtraBold', fontSize: 72, lineHeight: 76 },
      title: { fontFamily: 'ArchivoSemiExpanded-ExtraBold', fontSize: 30, lineHeight: 34 },
      bigNumber: { fontFamily: 'ArchivoExpanded-Bold', fontSize: 26, lineHeight: 28 },
      section: { fontFamily: 'Archivo-Bold', fontSize: 17, lineHeight: 22 },
      body: { fontFamily: 'Archivo-Regular', fontSize: 15, lineHeight: 20 },
      bodyStrong: { fontFamily: 'Archivo-SemiBold', fontSize: 15, lineHeight: 20 },
      number: { fontFamily: 'ArchivoSemiExpanded-SemiBold', fontSize: 15, lineHeight: 20 },
      caption: { fontFamily: 'Archivo-Regular', fontSize: 13, lineHeight: 18 },
      minimum: { fontFamily: 'Archivo-Regular', fontSize: 12, lineHeight: 16 },
    });
  });

  it('non scende mai sotto i 12 punti', () => {
    for (const style of Object.values(textStyles)) {
      expect(style.fontSize).toBeGreaterThanOrEqual(12);
    }
  });
});
