import type { TableCtx } from '../core/context';
import { formatDefault, q } from '../utils/dialect';
import { typedEntries } from '../utils/functions';
import { runTxn } from '../utils/sql';

export const createTable = async <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
): Promise<void> => {
  const entries = typedEntries(ctx.columns);
  const colDefs = entries.map(([key, spec]) => {
    const parts = [`${q(key)} ${spec.type}`];

    if (!spec.nullable) parts.push('NOT NULL');
    if (spec.unique) parts.push('UNIQUE');
    if (spec.check) parts.push(`CHECK (${spec.check})`);
    if (spec.default !== undefined) 
      parts.push(`DEFAULT ${formatDefault(spec.type, spec.default)}`);

    return parts.join(' ');
  });

  const defs: string[] = [];

  defs.push('row_id INTEGER PRIMARY KEY AUTOINCREMENT');
  defs.push(...colDefs);

  const sql = `CREATE TABLE IF NOT EXISTS ${q(ctx.tableName)} (${defs.join(', ')})`;
  await runTxn(ctx, sql, []);
};