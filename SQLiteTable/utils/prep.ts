import type { TableCtx } from '../core/context';
import type { SqlParam } from '../types';
import { jsonSerializer } from './serializer';

export const prep = <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
  key: string, 
  value: unknown,
): SqlParam => {
  const spec = ctx.columns[key];
  if (!spec) throw new Error(`[prepByColumn] Unknown column: ${key}`);
  if (value === null) return null;

  switch (spec.type) {
    case 'INTEGER': return value as number;
    case 'BOOLEAN': return (value as boolean) ? 1 : 0;
    case 'TEXT':    return value as string;
    case 'BLOB': {
      if (value instanceof Uint8Array) return value;
      return jsonSerializer.jsonObjectToBlob(value as object);
    }
    default: throw new Error(`[SQLiteTable-prepByColumn] Unsupported column type: ${spec.type}`);
  }
};