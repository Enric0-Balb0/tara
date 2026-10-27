/// <reference types="node" />

import { DatabaseSync } from 'node:sqlite';

import type { SqlDatabase, SqlValue } from '../sql';

/**
 * Database SQLite in memoria per i test, con la stessa interfaccia di expo-sqlite e le
 * stesse regole delle sue transazioni. Sul telefono `txn` è una connessione nuova: lì
 * foreign_keys è spento e le query sul database principale restano fuori dalla
 * transazione (le scritture falliscono con "database is locked"). Qui foreign_keys si
 * spegne per la durata della transazione e il database principale rifiuta ogni query
 * finché è aperta, anche le letture: più severo del telefono, mai più permissivo.
 */
export function openTestDatabase(): SqlDatabase {
  const sqlite = new DatabaseSync(':memory:');
  let transactionOpen = false;

  function connection(isTransaction: boolean): SqlDatabase {
    const guard = () => {
      if (transactionOpen && !isTransaction) {
        throw new Error('Query sul database principale con una transazione aperta: va fatta su txn');
      }
    };
    return {
      async execAsync(source) {
        guard();
        sqlite.exec(source);
      },
      async runAsync(source, ...params: SqlValue[]) {
        guard();
        const { changes } = sqlite.prepare(source).run(...params);
        return { changes: Number(changes) };
      },
      async getAllAsync<T>(source: string, ...params: SqlValue[]) {
        guard();
        return sqlite.prepare(source).all(...params) as T[];
      },
      async getFirstAsync<T>(source: string, ...params: SqlValue[]) {
        guard();
        return (sqlite.prepare(source).get(...params) as T | undefined) ?? null;
      },
      async withExclusiveTransactionAsync(task) {
        guard();
        const { foreign_keys } = sqlite.prepare('PRAGMA foreign_keys').get() as {
          foreign_keys: number;
        };
        // La pragma non ha effetto dentro una transazione: va prima di BEGIN.
        sqlite.exec('PRAGMA foreign_keys = OFF');
        sqlite.exec('BEGIN');
        transactionOpen = true;
        try {
          await task(connection(true));
          sqlite.exec('COMMIT');
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        } finally {
          transactionOpen = false;
          sqlite.exec(`PRAGMA foreign_keys = ${foreign_keys}`);
        }
      },
    };
  }

  return connection(false);
}
