/**
 * XMLHttpRequest finto per i test: ogni richiesta segue il copione dato, in ordine, come
 * fa quello di React Native (intestazioni, poi eventi progress a pezzi, poi load).
 */

import type { XhrConstructor, XhrLike, XhrProgressEvent } from '../catalogSync';

export type XhrScript =
  | {
      status: number;
      headers?: Record<string, string>;
      /** Il corpo, a pezzi: ogni pezzo è un evento progress. */
      chunks?: string[];
      /** Il totale dichiarato; null quando manca (risposta compressa o a pezzi). */
      total?: number | null;
    }
  | 'network-error'
  | 'hang';

export function fakeXhr(...scripts: XhrScript[]) {
  const requests: { method: string; url: string; headers: Record<string, string> }[] = [];

  class FakeXhr implements XhrLike {
    status = 0;
    readyState = 0;
    responseText = '';
    onreadystatechange: (() => void) | null = null;
    onprogress: ((event: XhrProgressEvent) => void) | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private headers: Record<string, string> = {};
    private responseHeaders = new Headers();
    private done = false;

    open(method: string, url: string) {
      requests.push({ method, url, headers: this.headers });
      this.readyState = 1;
    }

    setRequestHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    }

    getResponseHeader(name: string) {
      return this.responseHeaders.get(name);
    }

    abort() {
      if (this.done) return;
      this.done = true;
      this.onabort?.();
    }

    send() {
      const script = scripts.shift();
      if (script === undefined) throw new Error('richiesta inattesa');
      if (script === 'hang') return;
      setTimeout(() => {
        if (this.done) return;
        if (script === 'network-error') {
          this.done = true;
          this.onerror?.();
          return;
        }
        this.status = script.status;
        this.responseHeaders = new Headers(script.headers);
        this.readyState = 2;
        this.onreadystatechange?.();
        const total = script.total ?? null;
        let loaded = 0;
        for (const chunk of script.chunks ?? []) {
          this.responseText += chunk;
          loaded += new TextEncoder().encode(chunk).length;
          this.readyState = 3;
          this.onprogress?.({ loaded, total: total ?? -1, lengthComputable: total !== null });
        }
        this.readyState = 4;
        this.done = true;
        this.onload?.();
      }, 0);
    }
  }

  return { XMLHttpRequest: FakeXhr as XhrConstructor, requests };
}

/** Divide un testo in n pezzi di lunghezza simile. */
export function split(text: string, pieces: number): string[] {
  const size = Math.ceil(text.length / pieces);
  return Array.from({ length: pieces }, (_, i) => text.slice(i * size, (i + 1) * size));
}
