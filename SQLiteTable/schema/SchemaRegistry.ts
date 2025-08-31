/* eslint-disable @stylistic/max-len */

import type { SQLiteDatabase, Transaction } from 'react-native-sqlite-storage';

import type { SqlParam } from '../types';

const REG_TABLE_NAME = '__sp_schema';

export class SchemaRegistry {
  // eslint-disable-next-line no-empty-function
  constructor (private db: SQLiteDatabase, private debug: boolean) {}
  private q = (s: string) => `"${s.replace(/"/g, '""')}"`;

  async ensureMeta (): Promise<void> {
    await this.tx(tx => {
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS "${REG_TABLE_NAME}" (
        table_name TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
        [],
      );
      tx.executeSql(
        `CREATE INDEX IF NOT EXISTS "${REG_TABLE_NAME}_ver_idx"
       ON "${REG_TABLE_NAME}"(version)`,
        [],
      );
    });
  }

  async getTableVersion (table: string): Promise<number> {
    const rows = await this.query(`SELECT version FROM "${REG_TABLE_NAME}" WHERE table_name = ?`, [table]);
    return rows.length ? Number(Object.values(rows[0])[0]) : 0;
  }

  async setTableVersion (table: string, version: number): Promise<void> {
    const now = Date.now();
    await this.tx(tx => {
      tx.executeSql(
        `INSERT INTO "${REG_TABLE_NAME}"(table_name, version, updated_at)
       VALUES(?, ?, ?)
       ON CONFLICT(table_name) DO UPDATE
       SET version=excluded.version, updated_at=excluded.updated_at`,
        [table, version, now],
      );
    }); 
  }
  
  async getExistingColumns (table: string): Promise<string[]> {
    const rows = await this.query(`PRAGMA table_info(${this.q(table)})`);
    return rows.map(r => String((r as Record<string, unknown>).name));
  }

  // ---- tiny helpers
  private tx (body: (tx: Transaction) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        body(tx); 
      }, err => reject(err), () => resolve());
    });
  }

  private exec (tx: Transaction, sql: string, params: ReadonlyArray<SqlParam> = []): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      tx.executeSql(sql, params as SqlParam[], () => resolve(), (_t, e) => reject(e));
    });
  }

  private query (sql: string, params: ReadonlyArray<SqlParam> = []): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      this.db.readTransaction(tx => {
        tx.executeSql(sql, params as SqlParam[], (_t, rs) => {
          const rows: Record<string, unknown>[] = [];
          for (let i = 0; i < rs.rows.length; i++) rows.push(rs.rows.item(i));
          resolve(rows);
        }, (_t, e) => {
          reject(e); return false; 
        });
      }, err => reject(err));
    });
  }
}