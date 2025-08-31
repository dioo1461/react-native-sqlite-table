/* eslint-disable no-console */

import type { TableCtx } from '../core/context';
import type { SqlParam, Stmt } from '../types';

export const runTxn = <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
  sql: string, 
  params: readonly SqlParam[] = [], 
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    ctx.db.transaction(tx => {
      tx.executeSql(sql, params as SqlParam[], () => resolve(), (_tx, err) => {
        if (ctx.debug) {
          console.error('[SQLiteTable-runTxn] error while executing SQL:', sql, 'err:', err);
        }
        reject(err);
      });
    });
  });

export const runBatchTxn = async <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
  stmts: ReadonlyArray<Stmt>, 
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    ctx.db.transaction(tx => {
      for (const s of stmts) {
        const [sql, params] = typeof s === 'string' ? [s, []] : s;
        tx.executeSql(sql, params as SqlParam[]);
      }
    }, reject, () => resolve());
  });
};

export const runNoTxn = <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<void> => new Promise<void>((resolve, reject) => {
  ctx.db.executeSql(sql, params as SqlParam[], () => resolve(), (_tx, err) => {
    if (ctx.debug) {
      console.error('[SQLiteTable-runNoTxn] error while executing SQL:', sql, 'err:', err);
    }
    reject(err);
  });
});

export const runBatchNoTxn = async <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
  stmts: ReadonlyArray<Stmt>, 
): Promise<void> => {
  for (const s of stmts) {
    if (typeof s === 'string') await runNoTxn(ctx, s);
    else await runNoTxn(ctx, s[0], s[1]);
  }
};