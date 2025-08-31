import type { ColumnType } from '../types';

export const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export const formatDefault = (type: ColumnType, def: unknown): string => {
  if (def === null) return 'NULL';
  switch (type) {
    case 'INTEGER': return String(def);
    case 'BOOLEAN': return def ? '1' : '0';
    case 'TEXT':    return `'${String(def).replace(/'/g, '\'\'')}'`;
    case 'BLOB':    return `'${JSON.stringify(def).replace(/'/g, '\'\'')}'`;
    default: throw new Error(`Unsupported column type: ${type}`);
  }
};
