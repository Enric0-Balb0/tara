import { describe, expect, it } from 'vitest';

import {
  RESEND_COOLDOWN_SECONDS,
  authErrorMessage,
  isCompleteCode,
  isValidEmail,
  normalizeCode,
  normalizeEmail,
  otpRequest,
  resendSecondsLeft,
} from './accesso';

describe('email', () => {
  it('toglie gli spazi ai lati e porta tutto in minuscolo', () => {
    expect(normalizeEmail('  Enrico.Rossi@Example.COM \n')).toBe('enrico.rossi@example.com');
  });

  it('accetta un indirizzo con utente, dominio ed estensione', () => {
    expect(isValidEmail('enrico@example.com')).toBe(true);
    expect(isValidEmail('nome.cognome+dieta@posta.studenti.it')).toBe(true);
  });

  it('valida la forma dopo averla ripulita', () => {
    expect(isValidEmail('  Enrico@Example.com ')).toBe(true);
  });

  it.each([
    ['vuota', ''],
    ['solo spazi', '   '],
    ['senza chiocciola', 'enrico.example.com'],
    ['senza utente', '@example.com'],
    ['senza dominio', 'enrico@'],
    ['senza estensione', 'enrico@example'],
    ['con due chiocciole', 'enrico@@example.com'],
    ['con uno spazio in mezzo', 'enrico rossi@example.com'],
    ['con il punto in fondo', 'enrico@example.'],
  ])('rifiuta un indirizzo %s', (_, value) => {
    expect(isValidEmail(value)).toBe(false);
  });
});

describe('richiesta del codice', () => {
  it("manda l'email ripulita e non crea mai utenti: le iscrizioni sono chiuse", () => {
    expect(otpRequest('  Enrico@Example.com ')).toEqual({
      email: 'enrico@example.com',
      options: { shouldCreateUser: false },
    });
  });
});

describe('codice', () => {
  it('tiene solo le cifre, anche se incollato con spazi o trattini', () => {
    expect(normalizeCode(' 123 456 ')).toBe('123456');
    expect(normalizeCode('123-456')).toBe('123456');
    expect(normalizeCode('Il tuo codice: 987654')).toBe('987654');
  });

  it('non va oltre dieci cifre', () => {
    expect(normalizeCode('12345678901234')).toBe('1234567890');
  });

  it('è completo tra sei e dieci cifre', () => {
    expect(isCompleteCode('123456')).toBe(true);
    expect(isCompleteCode('12345678')).toBe(true);
    expect(isCompleteCode('1234567890')).toBe(true);
  });

  it('non è completo se corto, lungo o con altri caratteri', () => {
    expect(isCompleteCode('')).toBe(false);
    expect(isCompleteCode('12345')).toBe(false);
    expect(isCompleteCode('12345678901')).toBe(false);
    expect(isCompleteCode('12345a')).toBe(false);
    expect(isCompleteCode(' 123456')).toBe(false);
  });
});

describe('nuovo invio del codice', () => {
  const sentAt = Date.UTC(2026, 10, 18, 9, 0, 0);

  it('aspetta sessanta secondi', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(resendSecondsLeft(sentAt, sentAt)).toBe(60);
  });

  it('conta i secondi rimasti arrotondando per eccesso', () => {
    expect(resendSecondsLeft(sentAt, sentAt + 1)).toBe(60);
    expect(resendSecondsLeft(sentAt, sentAt + 1_000)).toBe(59);
    expect(resendSecondsLeft(sentAt, sentAt + 59_001)).toBe(1);
  });

  it('allo scadere del minuto si può rimandare', () => {
    expect(resendSecondsLeft(sentAt, sentAt + 60_000)).toBe(0);
    expect(resendSecondsLeft(sentAt, sentAt + 3_600_000)).toBe(0);
  });

  it("senza un invio precedente si può mandare subito", () => {
    expect(resendSecondsLeft(null, sentAt)).toBe(0);
  });

  it("se l'orologio torna indietro non attende più di un minuto", () => {
    expect(resendSecondsLeft(sentAt, sentAt - 3_600_000)).toBe(60);
  });
});

describe('messaggi di errore', () => {
  const authError = (code: string | undefined, status = 400) =>
    Object.assign(new Error('server message'), { name: 'AuthApiError', code, status });

  it('codice scaduto o sbagliato: Supabase usa otp_expired per entrambi', () => {
    expect(authErrorMessage(authError('otp_expired', 403))).toBe(
      'Il codice è sbagliato o scaduto. Controlla l’ultima email o chiedine uno nuovo.',
    );
  });

  it('credenziali non valide', () => {
    expect(authErrorMessage(authError('invalid_credentials'))).toBe(
      'Il codice è sbagliato o scaduto. Controlla l’ultima email o chiedine uno nuovo.',
    );
  });

  it('troppe email inviate', () => {
    expect(authErrorMessage(authError('over_email_send_rate_limit', 429))).toBe(
      'Hai chiesto troppi codici. Aspetta qualche minuto prima di chiederne un altro.',
    );
  });

  it('troppe richieste', () => {
    expect(authErrorMessage(authError('over_request_rate_limit', 429))).toBe(
      'Troppi tentativi ravvicinati. Aspetta qualche minuto e riprova.',
    );
  });

  it.each(['signup_disabled', 'otp_disabled', 'user_not_found'])(
    'accesso non consentito (%s)',
    (code) => {
      expect(authErrorMessage(authError(code, 422))).toBe(
        'Questa email non è abilitata: chiedi a Enrico di aggiungerti.',
      );
    },
  );

  it('indirizzo rifiutato dal server', () => {
    expect(authErrorMessage(authError('email_address_invalid'))).toBe(
      'Questo indirizzo email non sembra valido. Controlla di averlo scritto bene.',
    );
  });

  it('rete assente: supabase-js segnala AuthRetryableFetchError', () => {
    const offline = Object.assign(new Error('Network request failed'), {
      name: 'AuthRetryableFetchError',
      status: 0,
    });
    expect(authErrorMessage(offline)).toBe(
      'Non riesco a raggiungere il server. Controlla la connessione e riprova.',
    );
  });

  it('rete assente: errore di fetch di React Native', () => {
    expect(authErrorMessage(new TypeError('Network request failed'))).toBe(
      'Non riesco a raggiungere il server. Controlla la connessione e riprova.',
    );
  });

  it.each([
    ['codice sconosciuto', authError('unexpected_failure', 500)],
    ['errore senza codice', authError(undefined, 500)],
    ['errore generico', new Error('boom')],
    ['valore che non è un errore', 'boom'],
    ['null', null],
  ])('ripiega su un messaggio generico: %s', (_, error) => {
    expect(authErrorMessage(error)).toBe('Qualcosa è andato storto. Riprova tra poco.');
  });
});
