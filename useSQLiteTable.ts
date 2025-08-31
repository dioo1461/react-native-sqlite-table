import { isEqual } from 'es-toolkit';
import { useEffect, useMemo, useState } from 'react';

import { SQLiteTable } from './SQLiteTable/core/SQLiteTable';
import type { ColumnMapInput, DDLOption } from './SQLiteTable/types';

type UseSQLiteTableOptions<T extends Record<string, unknown>> = {
  dbName?: string;
  tableName: string;
  columns: ColumnMapInput<T>;
  ddlOption?: DDLOption;
};

export const useSQLiteTable = <T extends Record<string, unknown>>({
  dbName,
  tableName,
  columns,
  ddlOption,
}: UseSQLiteTableOptions<T>) => {
  const [stableCols, setStableCols] = useState<ColumnMapInput<T>>(columns);
  const [stableDDLOption, setStableDDLOption] = useState<DDLOption | undefined>(ddlOption);

  useEffect(() => {
    if (!isEqual(columns, stableCols)) setStableCols(columns);
    if (!isEqual(ddlOption, stableDDLOption)) setStableDDLOption(ddlOption);
  }, [columns, stableCols, ddlOption, stableDDLOption]);

  const table = useMemo(
    () =>
      new SQLiteTable<T>(
        dbName ?? 'MyAppSQLiteDB',
        tableName,
        stableCols,
        stableDDLOption,
        true,
      ),
    [dbName, tableName, stableCols, stableDDLOption],
  );

  useEffect(() => {
    void table.open();
    return () => {
      void table.close();
    };
  }, [table]);

  return table;
};
