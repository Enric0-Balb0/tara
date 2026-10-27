/// <reference types="node" />

import { DatabaseSync } from 'node:sqlite';

import type { SqlDatabase, SqlValue } from '../sql';

/** Database SQLite in memoria per i test, con la stessa interfaccia di expo-sqlite. */
export function openTestDatabase(): SqlDatabase {
  const sqlite = new DatabaseSync(':memory:');
  const db: SqlDatabase = {
    async execAsync(source) {
      sqlite.exec(source);
    },
    async runAsync(source, ...params: SqlValue[]) {
      const { changes } = sqlite.prepare(source).run(...params);
      return { changes: Number(changes) };
    },
    async getAllAsync<T>(source: string, ...params: SqlValue[]) {
      return sqlite.prepare(source).all(...params) as T[];
    },
    async getFirstAsync<T>(source: string, ...params: SqlValue[]) {
      return (sqlite.prepare(source).get(...params) as T | undefined) ?? null;
    },
    async withExclusiveTransactionAsync(task) {
      sqlite.exec('BEGIN');
      try {
        await task(db);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}
