/* eslint-disable @stylistic/max-len */

import type { TableCtx } from '../core/context';
import { SQLITE_RESERVED_PRIMARY_KEY } from '../core/SQLiteTable';
import { formatDefault, q } from '../utils/dialect';
import { typedEntries } from '../utils/functions';
import type { SchemaRegistry } from './SchemaRegistry';

export const rebuildPreserveData = async <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
  reg: SchemaRegistry,
): Promise<void> => {
  const tmp = `${ctx.tableName}__new_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // 1) 테이블 생성 sql 준비
  const entries = typedEntries(ctx.columns);
  const colDefs = entries.map(([k, s]) => {
    const parts = [`${q(k)} ${s.type}`];
    if (!s.nullable) parts.push('NOT NULL');
    if (s.unique) parts.push('UNIQUE');
    if (s.check) parts.push(`CHECK (${s.check})`);
    if (s.default !== undefined) parts.push(`DEFAULT ${formatDefault(s.type, s.default as unknown)}`);
    return parts.join(' ');
  });
  const defs = [`${SQLITE_RESERVED_PRIMARY_KEY} INTEGER PRIMARY KEY AUTOINCREMENT`, ...colDefs];
    
  // 2) 데이터 복사(교집합 컬럼) sql 준비
  const oldCols = await reg.getExistingColumns(ctx.tableName);
  const newCols = typedEntries(ctx.columns).map(([k]) => k);
  const copyCols = oldCols.filter(c => c !== SQLITE_RESERVED_PRIMARY_KEY && newCols.includes(c));

  // 3) 트랜잭션 실행
  await new Promise<void>((resolve, reject) => {
    ctx.db!.transaction(tx => {
      tx.executeSql('PRAGMA foreign_keys=OFF');
      tx.executeSql(`CREATE TABLE ${q(tmp)} (${defs.join(', ')})`);
      if (copyCols.length) {
        const colList = copyCols.map(q).join(',');
        tx.executeSql(`INSERT INTO ${q(tmp)} (${colList}) SELECT ${colList} FROM ${q(ctx.tableName)}`);
      }
      tx.executeSql(`DROP TABLE ${q(ctx.tableName)}`);
      tx.executeSql(`ALTER TABLE ${q(tmp)} RENAME TO ${q(ctx.tableName)}`);
      tx.executeSql('PRAGMA foreign_keys=ON');
    }, reject, () => resolve());
  });
};