/**
 * Carattere di Tara (docs/design.md, "Carattere"): una sola famiglia, Archivo, in più
 * larghezze. Ogni larghezza e peso è un file a sé, generato da `npm run fonts`.
 */

export type FontFamily =
  | 'Archivo-Regular'
  | 'Archivo-SemiBold'
  | 'Archivo-Bold'
  | 'ArchivoSemiExpanded-SemiBold'
  | 'ArchivoSemiExpanded-ExtraBold'
  | 'ArchivoExpanded-Bold'
  | 'ArchivoExpanded-ExtraBold';

export type TextRole =
  | 'readout'
  | 'title'
  | 'bigNumber'
  | 'section'
  | 'body'
  | 'bodyStrong'
  | 'number'
  | 'caption'
  | 'minimum';

export interface TextStyleToken {
  fontFamily: FontFamily;
  fontSize: number;
  lineHeight: number;
}

export const textStyles: Record<TextRole, TextStyleToken> = {
  readout: { fontFamily: 'ArchivoExpanded-ExtraBold', fontSize: 72, lineHeight: 76 },
  title: { fontFamily: 'ArchivoSemiExpanded-ExtraBold', fontSize: 30, lineHeight: 34 },
  bigNumber: { fontFamily: 'ArchivoExpanded-Bold', fontSize: 26, lineHeight: 28 },
  section: { fontFamily: 'Archivo-Bold', fontSize: 17, lineHeight: 22 },
  body: { fontFamily: 'Archivo-Regular', fontSize: 15, lineHeight: 20 },
  bodyStrong: { fontFamily: 'Archivo-SemiBold', fontSize: 15, lineHeight: 20 },
  number: { fontFamily: 'ArchivoSemiExpanded-SemiBold', fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: 'Archivo-Regular', fontSize: 13, lineHeight: 18 },
  minimum: { fontFamily: 'Archivo-Regular', fontSize: 12, lineHeight: 16 },
};
