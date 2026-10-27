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

import { type CatalogInfo, catalogInfo } from './catalogStore';
import { type SyncResult, syncCatalog } from './catalogSync';
import type { SqlDatabase } from './sql';

interface CatalogState {
  info: CatalogInfo | null;
  last: SyncResult | null;
  syncing: boolean;
  /** Controlla di nuovo con il server; non parte se un controllo è già in corso. */
  refresh: () => void;
}

const CatalogContext = createContext<CatalogState | null>(null);

/** All'avvio controlla il catalogo con il server; nel frattempo l'app usa quello che ha. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  // L'assegnazione senza cast è la prova che expo-sqlite soddisfa SqlDatabase.
  const db: SqlDatabase = useSQLiteContext();
  const [info, setInfo] = useState<CatalogInfo | null>(null);
  const [last, setLast] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(true);
  const running = useRef(false);

  const sync = useCallback(async () => {
    try {
      setInfo(await catalogInfo(db));
      setLast(await syncCatalog(db, { apiUrl: API_URL }));
      setInfo(await catalogInfo(db));
    } finally {
      running.current = false;
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

  const value = useMemo(
    () => ({ info, last, syncing, refresh }),
    [info, last, syncing, refresh],
  );
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogState {
  const state = useContext(CatalogContext);
  if (state === null) throw new Error('useCatalog va usato dentro CatalogProvider');
  return state;
}
