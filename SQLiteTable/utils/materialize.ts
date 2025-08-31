import type { TableCtx } from '../core/context';
import { typedEntries } from './functions';
import { type DBPrimitive, jsonSerializer } from './serializer';

export const materialize = <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
  row: Partial<T>,
): T => {
  const result = {} as T;

  for (const [key, value] of typedEntries(row)) {
    const spec = ctx.columns[key];
    const raw = value as DBPrimitive;
    let finalValue;
    if (spec.type === 'BLOB') {
      // 드라이버에 따라 undefined가 올 수 있어, ==로 비교하는 것이 더 안전함
      finalValue = raw == null ? null : jsonSerializer.blobToJsonObject(raw);
    } else if (spec.type === 'BOOLEAN') {
      finalValue = raw === 1 || raw === '1' || raw === true;
    } else {
      finalValue = raw;
    }
    (result as Record<string, unknown>)[key] = finalValue;
  }

  return result;
};