import { describe, expect, it } from 'vitest';

import { checkSecretKey, flowName, flowTags, pickE2eUser, selectFlows } from './e2eFlows.mjs';

const FLOW = (tags) => `appId: x\nname: Flusso\ntags:\n${tags.map((t) => `  - ${t}`).join('\n')}\n---\n- launchApp\n`;

describe('flowTags', () => {
  it("legge i tag dell'intestazione, con fine riga LF o CRLF", () => {
    expect(flowTags(FLOW(['api', 'dev']))).toEqual(['api', 'dev']);
    expect(flowTags(FLOW(['smoke']).replace(/\n/g, '\r\n'))).toEqual(['smoke']);
  });

  it('senza tag, o con un tag solo nei passi, non ne trova', () => {
    expect(flowTags('appId: x\n---\n- launchApp\n')).toEqual([]);
    expect(flowTags('appId: x\n---\ntags:\n  - api\n')).toEqual([]);
  });
});

describe('flowName', () => {
  it('accetta il nome, il file o il percorso del flusso', () => {
    expect(flowName('ricerca')).toBe('ricerca');
    expect(flowName('ricerca.yaml')).toBe('ricerca');
    expect(flowName('.maestro/ricerca.yaml')).toBe('ricerca');
    expect(flowName('.maestro\\ricerca.yaml')).toBe('ricerca');
  });
});

describe('selectFlows', () => {
  const files = [
    { file: 'catalogo.yaml', tags: ['api'] },
    { file: 'design.yaml', tags: ['design'] },
    { file: 'primo-download.yaml', tags: ['api', 'dev'] },
    { file: 'ricerca.yaml', tags: ['api'] },
  ];

  it('senza nomi prende tutti i flussi tranne quelli con un tag escluso', () => {
    expect(selectFlows(files, [], ['design', 'dev'])).toEqual({
      flows: ['catalogo.yaml', 'ricerca.yaml'],
      problems: [],
    });
  });

  it('con dei nomi prende solo quelli', () => {
    expect(selectFlows(files, ['ricerca.yaml', 'catalogo'], []).flows).toEqual([
      'catalogo.yaml',
      'ricerca.yaml',
    ]);
  });

  it('un nome che non esiste è un errore, con i nomi validi', () => {
    const { problems } = selectFlows(files, ['ricerca', 'primo_download'], []);
    expect(problems).toEqual([
      'Flusso sconosciuto: primo_download. Esistono: catalogo, design, primo-download, ricerca.',
    ]);
  });

  it('un flusso chiesto per nome ma escluso dai tag è un errore, non un salto silenzioso', () => {
    const { flows, problems } = selectFlows(files, ['primo-download'], ['dev']);
    expect(flows).toEqual([]);
    expect(problems).toEqual(['primo-download non gira qui: ha il tag dev.']);
  });

  it('nessun flusso da eseguire è un errore', () => {
    expect(selectFlows([{ file: 'design.yaml', tags: ['design'] }], [], ['design']).problems).toEqual([
      'Nessun flusso da eseguire.',
    ]);
  });
});

describe('checkSecretKey', () => {
  it('accetta una chiave sb_secret_ e toglie gli spazi ai lati', () => {
    expect(checkSecretKey(' sb_secret_AbC-12_x\r\n')).toBe('sb_secret_AbC-12_x');
  });

  it('rifiuta valori assenti o malformati senza ripeterli', () => {
    expect(checkSecretKey(undefined)).toBeNull();
    expect(checkSecretKey('')).toBeNull();
    expect(checkSecretKey('sb_secret_abc\ndef')).toBeNull();
    expect(checkSecretKey('sb_publishable_abc')).toBeNull();
    expect(checkSecretKey('eyJhbGciOi.service_role')).toBeNull();
  });
});

describe('pickE2eUser', () => {
  const users = [
    { email: 'io@example.com', email_confirmed_at: '2026-11-19T19:00:00Z' },
    { email: 'io+e2e@example.com', email_confirmed_at: '2026-11-19T19:00:00Z' },
    { email: 'nuovo+e2e@example.com', email_confirmed_at: null },
  ];

  it("senza indirizzo sceglie l'unico utente confermato con +e2e@", () => {
    expect(pickE2eUser(users)).toBe('io+e2e@example.com');
  });

  it("con l'indirizzo lo cerca tra gli utenti, senza badare alle maiuscole", () => {
    expect(pickE2eUser(users, 'IO+e2e@example.com')).toBe('io+e2e@example.com');
  });

  it('un indirizzo che non esiste è un errore: generate_link creerebbe un utente nuovo', () => {
    expect(() => pickE2eUser(users, 'io+e2e@exmaple.com')).toThrow(
      'TARA_E2E_EMAIL non corrisponde a nessun utente confermato di Supabase.',
    );
  });

  it('un utente non confermato non vale', () => {
    expect(() => pickE2eUser(users, 'nuovo+e2e@example.com')).toThrow('nessun utente confermato');
  });

  it('zero o più utenti con +e2e@ chiedono di scegliere', () => {
    expect(() => pickE2eUser([users[0]])).toThrow('Utenti confermati con "+e2e@" in Supabase: 0');
    const two = [...users, { email: 'altro+e2e@example.com', email_confirmed_at: '2026-11-19T19:00:00Z' }];
    expect(() => pickE2eUser(two)).toThrow('Utenti confermati con "+e2e@" in Supabase: 2');
  });
});
