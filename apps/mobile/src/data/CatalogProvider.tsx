import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { API_URL } from '@/config';
import type { CatalogProgress } from '@/domain/searchStatus';

import { type CatalogInfo, catalogInfo, clearCatalog } from './catalogStore';
import { type SyncResult, syncCatalog } from './catalogSync';
import type { SqlDatabase } from './sql';

interface CatalogState {
  info: CatalogInfo | null;
  last: SyncResult | null;
  syncing: boolean;
  /** A che punto è il controllo in corso; null quando non ce n'è uno. */
  progress: CatalogProgress | null;
  /** Controlla di nuovo con il server; non parte se un controllo è già in corso. */
  refresh: () => void;
  /** Menu Sviluppo: cancella il catalogo e lo riscarica, come al primo avvio. */
  reset: () => void;
}

const CatalogContext = createContext<CatalogState | null>(null);

/** All'avvio controlla il catalogo con il server; nel frattempo l'app usa quello che ha. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  // L'assegnazione senza cast è la prova che expo-sqlite soddisfa SqlDatabase.
  const db: SqlDatabase = useSQLiteContext();
  const [info, setInfo] = useState<CatalogInfo | null>(null);
  const [last, setLast] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [progress, setProgress] = useState<CatalogProgress | null>(null);
  const running = useRef(false);

  const sync = useCallback(async () => {
    try {
      setInfo(await catalogInfo(db));
      setLast(await syncCatalog(db, { apiUrl: API_URL, onProgress: setProgress }));
      setInfo(await catalogInfo(db));
    } finally {
      running.current = false;
      setProgress(null);
      setSyncing(false);
    }
  }, [db]);

  useEffect(() => {
    if (running.current) return;
    running.current = true;
    void sync();
  }, [sync]);

  const refresh = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    void sync();
  }, [sync]);

  const reset = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    void (async () => {
      try {
        await clearCatalog(db);
      } finally {
        await sync();
      }
    })();
  }, [db, sync]);

  const value = useMemo(
    () => ({ info, last, syncing, progress, refresh, reset }),
    [info, last, syncing, progress, refresh, reset],
  );
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogState {
  const state = useContext(CatalogContext);
  if (state === null) throw new Error('useCatalog va usato dentro CatalogProvider');
  return state;
}
