/**
 * Identificativi UUIDv7 (RFC 9562), generati sul telefono anche offline (docs/requisiti.md,
 * "Modello dati"): 48 bit di millisecondi e poi bit casuali, così gli id si ordinano per
 * tempo e la sincronizzazione non ha bisogno di chiedere un id al server.
 */

const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

/** UUIDv7 dai millisecondi e da almeno 10 byte casuali. */
export function uuidv7(nowMs: number, randomBytes: Uint8Array): string {
  if (randomBytes.length < 10) throw new Error('Servono almeno 10 byte casuali');
  const bytes = new Uint8Array(16);
  let time = Math.floor(nowMs);
  for (let index = 5; index >= 0; index--) {
    bytes[index] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes.set(randomBytes.subarray(0, 10), 6);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f); // versione 7
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f); // variante 10xx
  const hex = Array.from(bytes, (byte) => HEX[byte] ?? '00').join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Byte casuali: `crypto.getRandomValues` dove esiste, altrimenti `Math.random`. Gli id non
 * sono segreti (ogni riga è legata all'utente e protetta dal server): serve solo che non si
 * ripetano, e 74 bit casuali per millisecondo bastano.
 */
function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => void } })
    .crypto;
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }
  for (let index = 0; index < count; index++) bytes[index] = Math.floor(Math.random() * 256);
  return bytes;
}

export function newId(nowMs: number = Date.now()): string {
  return uuidv7(nowMs, randomBytes(10));
}
