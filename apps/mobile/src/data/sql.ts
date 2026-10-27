/**
 * La parte di `SQLiteDatabase` di expo-sqlite che usa lo strato dati. Il database
 * dell'app la soddisfa così com'è; nei test la implementa `node:sqlite` in memoria
 * (`testing/nodeDatabase.ts`), così l'SQL si prova vero anche in Node.
 */

export type SqlValue = string | number | null;

export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null>;
  /**
   * Solo le query fatte su `txn` stanno nella transazione. In expo-sqlite `txn` è una
   * connessione nuova: le pragma della connessione principale (es. `foreign_keys`) lì
   * non valgono, quindi l'SQL della transazione non deve dipenderne.
   */
  withExclusiveTransactionAsync(task: (txn: SqlDatabase) => Promise<void>): Promise<void>;
}
