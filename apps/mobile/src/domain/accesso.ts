/**
 * Accesso con codice via email (Supabase Auth): pulizia di email e codice, attesa prima
 * di un nuovo invio e messaggi di errore in italiano. Niente React né Supabase qui:
 * gli errori arrivano come valori qualsiasi e si leggono solo `name`, `code` e `message`.
 */

/** Secondi da aspettare prima di chiedere un altro codice. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Lunghezza del codice: Supabase la configura tra 6 e 10 cifre. */
const CODE_MIN_LENGTH = 6;
const CODE_MAX_LENGTH = 10;

// Forma, non verità: utente, una sola chiocciola, dominio con un'estensione di almeno due
// lettere. Se l'indirizzo non esiste lo dice l'email che non arriva.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  return EMAIL_SHAPE.test(normalizeEmail(input));
}

/**
 * Argomenti di `supabase.auth.signInWithOtp`. Le iscrizioni sono chiuse (gli utenti li
 * crea Enrico dal pannello di Supabase), quindi un indirizzo sconosciuto non diventa mai
 * un account: shouldCreateUser è sempre false.
 */
export function otpRequest(email: string): {
  email: string;
  options: { shouldCreateUser: false };
} {
  return { email: normalizeEmail(email), options: { shouldCreateUser: false } };
}

/** Solo le cifre, al massimo dieci: il codice si può incollare con spazi o testo attorno. */
export function normalizeCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, CODE_MAX_LENGTH);
}

export function isCompleteCode(code: string): boolean {
  return /^\d+$/.test(code) && code.length >= CODE_MIN_LENGTH && code.length <= CODE_MAX_LENGTH;
}

/**
 * Secondi che mancano prima di poter chiedere un altro codice, arrotondati per eccesso.
 * `sentAt` e `now` sono millisecondi (Date.now()); senza un invio precedente vale zero.
 */
export function resendSecondsLeft(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0;
  const remainingMs = sentAt + RESEND_COOLDOWN_SECONDS * 1000 - now;
  return Math.min(RESEND_COOLDOWN_SECONDS, Math.max(0, Math.ceil(remainingMs / 1000)));
}

const WRONG_CODE = 'Il codice è sbagliato o scaduto. Controlla l’ultima email o chiedine uno nuovo.';
const NOT_ALLOWED = 'Questa email non è abilitata: chiedi a Enrico di aggiungerti.';
const OFFLINE = 'Non riesco a raggiungere il server. Controlla la connessione e riprova.';
const UNKNOWN = 'Qualcosa è andato storto. Riprova tra poco.';

// Codici di AuthError.code in @supabase/auth-js (lib/error-codes). Per un codice sbagliato
// il server risponde otp_expired, come per uno scaduto: i due casi non si distinguono.
const MESSAGES: Record<string, string> = {
  otp_expired: WRONG_CODE,
  invalid_credentials: WRONG_CODE,
  over_email_send_rate_limit:
    'Hai chiesto troppi codici. Aspetta qualche minuto prima di chiederne un altro.',
  over_request_rate_limit: 'Troppi tentativi ravvicinati. Aspetta qualche minuto e riprova.',
  // Con shouldCreateUser: false un indirizzo sconosciuto arriva come otp_disabled
  // ("Signups not allowed for otp"); gli altri due coprono le varianti del server.
  signup_disabled: NOT_ALLOWED,
  otp_disabled: NOT_ALLOWED,
  user_not_found: NOT_ALLOWED,
  email_address_invalid:
    'Questo indirizzo email non sembra valido. Controlla di averlo scritto bene.',
};

function field(error: object, key: string): unknown {
  return (error as Record<string, unknown>)[key];
}

/** Messaggio da mostrare per un errore di accesso, qualunque cosa sia stato lanciato. */
export function authErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return UNKNOWN;

  const code = field(error, 'code');
  if (typeof code === 'string' && code in MESSAGES) return MESSAGES[code] ?? UNKNOWN;

  // supabase-js trasforma i fallimenti di fetch in AuthRetryableFetchError; un fetch
  // fuori dal client lancia il TypeError di React Native o del browser.
  const name = field(error, 'name');
  const message = field(error, 'message');
  if (name === 'AuthRetryableFetchError') return OFFLINE;
  if (typeof message === 'string' && /network request failed|failed to fetch/i.test(message)) {
    return OFFLINE;
  }
  return UNKNOWN;
}
