/* eslint-disable no-console, @stylistic/max-len */

import {
  openDatabase,
  type SQLiteDatabase,
} from 'react-native-sqlite-storage';

import { buildInsertStmt, validateRow } from '../crud/insert';
import { reconcileSchema } from '../schema/reconcile';
import { SchemaRegistry } from '../schema/SchemaRegistry';
import type {
  ColumnMapInput,
  ColumnMapNorm,
  DDLOption,
  SqlParam,
  Stmt,
} from '../types';
import { q } from '../utils/dialect';
import { materialize } from '../utils/materialize';
import { normalizeColumns } from '../utils/normalize';
import { prep } from '../utils/prep';
import { runBatchNoTxn, runBatchTxn, runNoTxn, runTxn } from '../utils/sql';
import type { TableCtx } from './context';

export const SQLITE_RESERVED_PRIMARY_KEY = 'row_id';

type WithPK<T> = T & { [SQLITE_RESERVED_PRIMARY_KEY]: number };

// TODO: 성능 개선을 위해 DB 객체를 싱글턴으로 관리하고, 세마포어 구현을 통해 경쟁적 open/close를 방지하는 방안 고려
// TODO: 모든 DDL 쿼리의 진입점을 싱글턴에 두고, useSQLiteTable 훅은 DDL을 싱글턴에 등록만 하도록 구조 개선 고려
export class SQLiteTable<T extends Record<string, unknown>> {
  private db?: SQLiteDatabase;
  private opening?: Promise<SQLiteDatabase>;
  private columns: ColumnMapNorm<T>;

  constructor (
    readonly dbName: string,
    readonly tableName: string,
    columns: ColumnMapInput<T>,
    private readonly ddlOption?: DDLOption,
    private debug: boolean = false,
  ) {
    if (!columns || Object.keys(columns).length === 0) {
      throw new Error('Column definitions must be provided');
    }
    if (columns[SQLITE_RESERVED_PRIMARY_KEY]) {
      // eslint-disable-next-line @stylistic/max-len
      throw new Error(`Column "${SQLITE_RESERVED_PRIMARY_KEY}" is reserved and cannot be used in column definitions`);
    }
    this.columns = normalizeColumns(columns);
  }

  private get ctx (): TableCtx<T> {
    return { 
      db: this.db!,
      tableName: this.tableName,
      columns: this.columns,
      ddlOption: this.ddlOption,
      debug: this.debug,
    };
  }

  /* ---------- lifecycle ---------- */
  async open (): Promise<SQLiteDatabase | null> {
    if (this.db) return this.db;
    if (!this.opening) {
      this.opening = new Promise<SQLiteDatabase>((resolve, reject) => {
        openDatabase({ name: `${this.dbName}.db`, location: 'default' }, resolve, reject);
      }).then(async db => {
        this.db = db;
        const reg = new SchemaRegistry(db, this.debug);
        await reg.ensureMeta();
        if (this.ddlOption?.onEveryOpen?.length) await runBatchNoTxn(this.ctx, this.ddlOption.onEveryOpen);
        await reconcileSchema(this.ctx, reg);
        return db;
      })
        .finally(() => {
          this.opening = undefined; 
        });
    }
    return await this.opening;
  }

  async close (): Promise<void> {
    if (!this.db) return;
    await new Promise<void>((resolve, reject) => {
      this.db!.close(resolve, reject);
    });
    this.db = undefined;
    this.opening = undefined;
  }

  /* ---------- CRUD ---------- */
  async insertMany (rows: ReadonlyArray<Partial<T>>): Promise<void> {
    if (!rows.length) return;
    await this.open();

    const stmts: Stmt[] = [];
    for (const row of rows) {
      const validated = validateRow(this.ctx, row);
      stmts.push(buildInsertStmt(this.ctx, validated));
    }
    await runBatchTxn(this.ctx, stmts);
  }

  async insert (row: Partial<T>): Promise<void> {
    await this.insertMany([row]);
  }

  async update (where: Partial<T>, changes: Partial<T>): Promise<void> {
    if (!Object.keys(where).length) throw new Error('[SQLiteTable-update] where object is required');
    if (!Object.keys(changes).length) throw new Error('[SQLiteTable-update] changes object is required');
    await this.open();
    const setExpr = Object.keys(changes).map(k => `${q(k)} = ?`).join(', ');
    const whereExpr = Object.keys(where).map(k => `${q(k)} = ?`).join(' AND ');

    const vals: SqlParam[] = [
      ...Object.keys(changes).map(k => prep(this.ctx, k, changes[k as keyof T])),
      ...Object.keys(where).map(k => prep(this.ctx, k, where[k as keyof T])),
    ];

    const sql = `UPDATE ${q(this.tableName)} SET ${setExpr} WHERE ${whereExpr}`;
    await runTxn(this.ctx, sql, vals);
  }

  async delete (where: Partial<T>): Promise<void> {
    if (!Object.keys(where).length) throw new Error('[SQLiteTable-delete] where object is required');

    await this.open();
    const whereExpr = Object.keys(where)
      .map(k => `${q(k)} = ?`)
      .join(' AND ');
    const vals = Object.keys(where).map(k => prep(this.ctx, k, where[k as keyof T]));

    await runTxn(this.ctx, `DELETE FROM ${q(this.tableName)} WHERE ${whereExpr}`, vals);
  }

  async all (): Promise<T[]> {
    await this.open();
    return this.query(`SELECT * FROM ${q(this.tableName)}`);
  }

  async findByKeyValue (targetKeyValue: Partial<T>): Promise<T[]> {
    await this.open();
    const whereExpr = Object.keys(targetKeyValue)
      .map(k => `${q(k)} = ?`)
      .join(' AND ');
    const vals = Object.keys(targetKeyValue).map(k => prep(this.ctx, k, targetKeyValue[k as keyof T]));

    return this.query(`SELECT * FROM ${q(this.tableName)} WHERE ${whereExpr}`, vals);
  }

  /** 결과 집계 쿼리 */
  async query (sql: string, params: SqlParam[] = []): Promise<T[]> {
    await this.open();
    return new Promise<T[]>((resolve, reject) => {
      this.db!.readTransaction(tx => {
        tx.executeSql(
          sql,
          params,
          (_tx, resultSet) => {
            const rows: T[] = [];
            for (let i = 0; i < resultSet.rows.length; i++) {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              const { row_id, ...item } = resultSet.rows.item(i);
              rows.push(
                materialize(this.ctx, item),
              );
            }
            resolve(rows);
          },
          (_tx, err) => {
            if (this.debug) console.error('[SQLiteTable-query] error while executing SQL:', err);
            reject(err);
            return false; // 트랜잭션 중단
          },
        );
      });
    });
  }

  // TODO: query와의 코드 중복 제거
  async queryWithPK (sql: string, params: SqlParam[] = []): Promise<WithPK<T>[]> {
    await this.open();
    return new Promise<WithPK<T>[]>((resolve, reject) => {
      this.db!.readTransaction(tx => {
        tx.executeSql(
          sql,
          params,
          (_tx, rs) => {
            const rows: WithPK<T>[] = [];
            for (let i = 0; i < rs.rows.length; i++) {
              const item = rs.rows.item(i) as Record<string, unknown>;
              // eslint-disable-next-line @typescript-eslint/naming-convention
              const { [SQLITE_RESERVED_PRIMARY_KEY]: rowId, ...rest } = item;
              const mat = materialize(this.ctx, rest as Partial<T>);
              rows.push({ ...(mat as T), [SQLITE_RESERVED_PRIMARY_KEY]: rowId as number });
            }
            resolve(rows);
          },
          (_tx, err) => {
            if (this.debug) console.error('[SQLiteTable-queryWithPK] error:', err);
            reject(err);
            return false;
          },
        );
      });
    });
  }

  run (sql: string, params: SqlParam[] = []): Promise<void> {
    return runNoTxn(this.ctx, sql, params);
  }
}
