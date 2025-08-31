/* eslint-disable no-console */

import type { TableCtx } from '../core/context';
import type { SqlParam, Stmt } from '../types';
import { q } from '../utils/dialect';
import { typedEntries } from '../utils/functions';
import { prep } from '../utils/prep';

export const validateRow = <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
  row: Partial<T>,
): Record<string, unknown> => {
  const validatedRow: Record<string, unknown> = {};
  typedEntries(ctx.columns).forEach(([k, spec]) => {
    const provided = Object.prototype.hasOwnProperty.call(row, k);
    const v = row[k];
    // 컬럼 값이 undefined인 경우 컬럼 생략
    if (!provided || v === undefined) return;

    // 컬럼 값이 null인 경우
    if (v === null) {
      if (!spec.nullable) throw new Error(`[SQLiteTable] "${k}" cannot be null`);
      else validatedRow[k] = null;
      return;
    }

    // 컬럼 값이 제공된 경우, 타입에 따라 데이터 검증 후 validatedRow에 추가
    switch (ctx.columns[k].type) {
      case 'TEXT': {
        if (typeof v !== 'string') 
          throw new Error(`[SQLiteTable] "${k}" must be string but got ${v}`);
        if (v.trim() === '') {
          // eslint-disable-next-line @stylistic/max-len
          if (ctx.debug) console.warn(`[SQLiteTable] "${k}" is empty string, it will be handled as default value or null if nullable`);
          if (spec.default !== undefined) return; // default가 지정된 경우 빈 문자열을 무시하고 default가 적용되도록 함
          if (spec.nullable) {
            validatedRow[k] = null; return;
          }
          throw new Error(`[SQLiteTable] "${k}" cannot be empty string`);
        }
        validatedRow[k] = v;
        break;
      }
      case 'INTEGER': {
        if (!Number.isInteger(v))
          throw new Error(`[SQLiteTable] "${k}" must be integer but got ${v}`);
        if (!Number.isSafeInteger(v))
          throw new Error(`[SQLiteTable] "${k}" out of safe range, got ${v}`);
        validatedRow[k] = v;
        break;
      }
      case 'BOOLEAN': {
        if (typeof v !== 'boolean') {
          throw new Error(`[SQLiteTable] "${k}" must be boolean but got ${v}`);
        }
        validatedRow[k] = v;
        break;
      }
      case 'BLOB': {
        if (typeof v !== 'object') {
          throw new Error(
            `[SQLiteTable] "${k}" must be serializable object but got ${v}`,
          );
        }
        validatedRow[k] = v;
        break;
      }
      default: {
        throw new Error(`[SQLiteTable] Unsupported column type: ${spec.type}`);
      }
    }
  });
  return validatedRow;
};

export const buildInsertStmt = <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
  validatedRow: Record<string, unknown>,
): Stmt => {
  if (!Object.keys(validatedRow).length) {
    // 모든 값이 default/nullable 처리 → DEFAULT VALUES
    return `INSERT INTO ${q(ctx.tableName)} DEFAULT VALUES`;
  }

  const cols = Object.keys(validatedRow);
  const qs = cols.map(() => '?').join(',');
  const vals: SqlParam[] = cols.map(k => prep(ctx, k, validatedRow[k]));
  return [
    `INSERT INTO ${q(ctx.tableName)} (${cols.map(q).join(',')}) VALUES (${qs})`,
    vals,
  ];
};