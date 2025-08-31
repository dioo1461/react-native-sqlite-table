import type { SQLiteDatabase } from 'react-native-sqlite-storage';

import type { ColumnMapNorm, DDLOption } from '../types';

export type TableCtx<T extends Record<string, unknown>> = {
  db: SQLiteDatabase;
  tableName: string;
  columns: ColumnMapNorm<T>;
  ddlOption?: DDLOption;
  debug: boolean;
};
