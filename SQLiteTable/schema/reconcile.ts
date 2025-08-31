/* eslint-disable no-console */

import type { SQLiteDatabase } from 'react-native-sqlite-storage';

import type { TableCtx } from '../core/context';
import type { SqlParam, Stmt } from '../types';
import { typedEntries } from '../utils/functions';
import { runBatchNoTxn, runBatchTxn, runTxn } from '../utils/sql';
import { createTable } from './createTable';
import { rebuildPreserveData } from './rebuild';
import type { SchemaRegistry } from './SchemaRegistry';

// TODO: 테스트를 통해 Reconcilation 동작 검증
export const reconcileSchema = async <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
  reg: SchemaRegistry,
): Promise<void> => {
  // 0) DDL 없음: 비관리 모드
  if (!ctx.ddlOption) {
    const legacyCols = await reg.getExistingColumns(ctx.tableName);
    if (legacyCols.length === 0) await createTable(ctx); // 최초 테이블만 생성
    return; // 메타 버전 갱신하지 않음(=0 유지)
  }

  // 1) DDL 있음: 관리 모드 (기존 로직)
  const target = ctx.ddlOption.version;
  const current = await reg.getTableVersion(ctx.tableName);

  if (current === 0) {
    const legacyCols = await reg.getExistingColumns(ctx.tableName);
    const isLegacy = legacyCols.length > 0;

    if (!isLegacy) {
      if (ctx.ddlOption.beforeCreateNoTxn?.length) {
        await runBatchNoTxn(ctx, ctx.ddlOption.beforeCreateNoTxn);
      }
      await createTable(ctx);
      if (ctx.ddlOption.afterCreateTxn?.length) {
        await runBatchTxn(ctx, ctx.ddlOption.afterCreateTxn);
      }
      if (ctx.ddlOption.afterCreateNoTxn?.length) {
        await runBatchNoTxn(ctx, ctx.ddlOption.afterCreateNoTxn);
      }
      await reg.setTableVersion(ctx.tableName, target);
      return;
    }

    // 레거시 채택/재빌드 분기(이전 제안 그대로)
    const newCols = typedEntries(ctx.columns).map(([k]) => k.toLowerCase());
    const legacySet = new Set(legacyCols.map(c => c.toLowerCase()));
    const sameLayout = legacyCols.length === newCols.length && newCols.every(c => legacySet.has(c));

    if (!sameLayout) {
      await rebuildPreserveData(ctx, reg);
    }
    if (ctx.ddlOption.afterCreateTxn?.length) {
      await runBatchTxn(ctx, ctx.ddlOption.afterCreateTxn);
    }
    if (ctx.ddlOption.afterCreateNoTxn?.length) {
      await runBatchNoTxn(ctx, ctx.ddlOption.afterCreateNoTxn);
      await reg.setTableVersion(ctx.tableName, target);
      return;
    }
  }
  if (current < target) {
    if (ctx.ddlOption.migrationSteps?.length) {
      await migrateWithSteps(ctx, reg, current, target);
    } else {
      await rebuildPreserveData(ctx, reg);
      if (ctx.ddlOption.afterCreateTxn?.length) {
        await runBatchTxn(ctx, ctx.ddlOption.afterCreateTxn);
      }
      if (ctx.ddlOption.afterCreateNoTxn?.length) {
        await runBatchNoTxn(ctx, ctx.ddlOption.afterCreateNoTxn);
      }
      await reg.setTableVersion(ctx.tableName, target);
    }
  }
}; 

interface MigrationCtx {
  db: SQLiteDatabase;
  table: string;
  run: (sql: string, params?: ReadonlyArray<SqlParam>) => Promise<void>;
  applyTxn: (stmts: ReadonlyArray<Stmt>) => Promise<void>;
  applyNoTxn: (stmts: ReadonlyArray<Stmt>) => Promise<void>;
  rebuildPreserveData: () => Promise<void>;
  getExistingColumns: () => Promise<string[]>;
}

export interface MigrationStep {
  /** 이 스텝을 끝내면 도달할 버전(현재+1 권장) */
  to: number;
  /** 트랜잭션 밖에서 선행 */
  preNoTxn?: ReadonlyArray<Stmt>;
  /** 하나의 트랜잭션으로 원자 적용 */
  txn?: ReadonlyArray<Stmt>;
  /** 트랜잭션 밖에서 후행 */
  postNoTxn?: ReadonlyArray<Stmt>;
  /** 강제 재빌드 전략 */
  strategy?: 'alter' | 'rebuild';
  custom?: (ctx: MigrationCtx) => Promise<void>;
}

const migrateWithSteps = async <T extends Record<string, unknown>>(
  ctx: TableCtx<T>,
  reg: SchemaRegistry,
  current: number,
  target: number,
): Promise<void> => {
  const stepsByTo = new Map<number, MigrationStep>(
    (ctx.ddlOption!.migrationSteps ?? []).map(s => [s.to, s]),
  );
  let cur = current;

  while (cur < target) {
    const next = cur + 1;
    const step = stepsByTo.get(next);

    if (!step) {
      // 스텝이 없으면 안전 기본전략: 재빌드 후 다음으로
      await rebuildPreserveData(ctx, reg);
      await reg.setTableVersion(ctx.tableName, next);
      cur = next;
      continue;
    }

    try {
      if (step.preNoTxn?.length) await runBatchNoTxn(ctx, step.preNoTxn);
      if (step.strategy === 'rebuild') await rebuildPreserveData(ctx, reg);
      if (step.txn?.length) await runBatchTxn(ctx, step.txn);
      if (step.custom) await step.custom(makeMigrationCtx(ctx, reg));
      if (step.postNoTxn?.length) await runBatchNoTxn(ctx, step.postNoTxn);

      // 스텝이 끝나면 버전 상승
      await reg.setTableVersion(ctx.tableName, next);
      cur = next;
    } catch (e) {
      if (ctx.debug) console.error('[SQLiteTable-migrateWithSteps]', e);
      throw e; // 실패 시 버전 미상승 → 다음 open에서 재시도 가능
    }
  }
};

const makeMigrationCtx = <T extends Record<string, unknown>>(
  ctx: TableCtx<T>, 
  reg: SchemaRegistry,
): MigrationCtx => ({
  db: ctx.db!,
  table: ctx.tableName,
  run: (sql, params = []) => runTxn(ctx, sql, params),
  applyTxn: (stmts) => runBatchTxn(ctx, stmts),
  applyNoTxn: (stmts) => runBatchNoTxn(ctx, stmts),
  rebuildPreserveData: () => rebuildPreserveData(ctx, reg),
  getExistingColumns: () => reg.getExistingColumns(ctx.tableName),
});