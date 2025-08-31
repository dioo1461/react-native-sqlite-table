import type { MigrationStep } from './schema/reconcile';

/* eslint-disable @stylistic/max-len */

type IsAny<T> = 0 extends (1 & T) ? true : false;

type IsUnknown<T> =
  IsAny<T> extends true ? false :
    unknown extends T
      ? ([T] extends [unknown] ? true : false)
      : false;
      
export type SqlParam = string | number | boolean | null | Uint8Array | undefined;

export type NullishOf<V> = [Extract<V, null>] extends [never] ? false : true;

export type ColumnType = 'TEXT' | 'INTEGER' | 'REAL' | 'BOOLEAN' | 'BLOB';
export type ColumnTypeOf<V> =
  V extends string ? 'TEXT' :
    V extends number ? 'INTEGER' | 'REAL' :
      V extends boolean ? 'BOOLEAN' :
        V extends object ? 'BLOB' :
          ColumnType;
          
export type ColumnSpecFor<V> =
  IsUnknown<V> extends true
    ? (ColumnType | { type: ColumnType; nullable?: boolean }) // 제네릭을 넘기지 않은 경우(unknown)
    : NullishOf<V> extends false // 키값이 nullable한지 판별
      ? (ColumnTypeOf<V> | Omit<ColumnSpecNorm<V>, 'nullable'> & (NullishOf<V> extends true
        ? { nullable: true }
        : { nullable?: false } | ColumnSpecNorm<V>)) // non-nullable인 경우
      : ColumnSpecNorm<V>; // nullable인 경우

export type ColumnMapInput<T extends Record<string, unknown>> = {
  [K in keyof T]-?: ColumnSpecFor<T[K]>;
};

export type ColumnSpecNorm<V> = {
  type: ColumnTypeOf<NonNullable<V>>;
  nullable: NullishOf<V>;
  default?: V;
  unique?: boolean;
  check?: string;
};

export type ColumnMapNorm<T extends Record<string, unknown>> = {
  [K in keyof T]-?: ColumnSpecNorm<T[K]>;
};

/**
 * 단일 테이블의 DDL 부트스트랩/재생성을 위한 실행 계획을 정의합니다.
 * 실행 순서: `beforeCreateNoTxn` → (BEGIN; CREATE TABLE; `afterCreateTxn`; COMMIT) → `afterCreateNoTxn`.
 * `onEveryOpen`은 마이그레이션과 무관하게 커넥션이 열릴 때마다 적용됩니다.
 *
 * @example
 * const chatDDL: DDLOption = {
 *   version: 1,
 *   beforeCreateNoTxn: [['PRAGMA auto_vacuum=INCREMENTAL']],
 *   afterCreateTxn: [
 *     [`CREATE TABLE IF NOT EXISTS chat(row_id INTEGER PRIMARY KEY, room_id TEXT, message TEXT, timestamp INTEGER)`],
 *     ['CREATE INDEX IF NOT EXISTS idx_chat_room_ts ON chat(room_id, timestamp)']
 *   ],
 *   afterCreateNoTxn: [['PRAGMA journal_mode=WAL']],
 *   onEveryOpen: [['PRAGMA foreign_keys=ON'], ['PRAGMA synchronous=NORMAL']]
 * };
 */
export interface DDLOption {
  /**
   * 본 DDL이 목표로 하는 스키마 버전입니다.
   * 드롭 후 재생성 또는 최초 부트스트랩 시 이 버전에 맞춰 테이블을 구성합니다.
   * 버전은 양수만 허용됩니다.
   */
  version: number;

  /**
   * 테이블 생성 이전, 트랜잭션 바깥에서 1회 실행할 문장 목록입니다.
   * 파일 레이아웃/전역 옵션처럼 사전 적용이 필요한 PRAGMA를 배치하십시오.
   * 예: ['PRAGMA page_size=4096'], ['PRAGMA auto_vacuum=INCREMENTAL']
   */
  beforeCreateNoTxn?: ReadonlyArray<Stmt>;

  /**
   * 테이블 생성 직후, 하나의 트랜잭션 내부에서 원자적으로 실행할 문장 목록입니다.
   * 인덱스/트리거/초기 데이터 적재 등 스키마 관련 작업을 배치하십시오.
   * 예: ['CREATE INDEX ...'], ['CREATE TRIGGER ...'], ['INSERT ...']
   */
  afterCreateTxn?: ReadonlyArray<Stmt>;

  /**
   * 테이블 생성 이후, 트랜잭션 바깥에서 실행할 문장 목록입니다.
   * WAL 전환, 체크포인트, VACUUM 등 사후 유지보수/런타임 전환 작업을 배치하십시오.
   * 예: ['PRAGMA journal_mode=WAL'], ['PRAGMA wal_checkpoint(TRUNCATE)'], ['VACUUM']
   */
  afterCreateNoTxn?: ReadonlyArray<Stmt>;

  /**
   * 데이터베이스 커넥션이 열릴 때마다 적용할 세션 단위 설정입니다.
   * 마이그레이션과 별개로 매 오픈 시 반복 적용되며, 영구 저장되지 않는 PRAGMA에 적합합니다.
   * 예: ['PRAGMA foreign_keys=ON'], ['PRAGMA synchronous=NORMAL']
   */
  onEveryOpen?: ReadonlyArray<Stmt>;
  migrationSteps?: ReadonlyArray<MigrationStep>;
}

/**
 * 단일 SQL 문과 선택적 바인딩 파라미터를 나타내는 튜플입니다.
 * 첫 요소는 SQL 문자열, 두 번째 요소는 읽기 전용 파라미터 배열입니다.
 */
export type Stmt = string | readonly [sql: string, params: ReadonlyArray<SqlParam>];
