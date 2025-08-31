import type { 
  ColumnMapInput,
  ColumnMapNorm,
  ColumnSpecFor, 
  ColumnSpecNorm, 
  ColumnType, 
  ColumnTypeOf,
  NullishOf,
} from '../types';
import { typedEntries } from './functions';

const normalizeSpec = <V>(spec: ColumnSpecFor<V>): ColumnSpecNorm<V> => {
  // 문자열 숏핸드 → non-nullish에서만 허용, nullable=false로 정규화
  if (typeof spec === 'string') {
    return {
      type: spec as ColumnTypeOf<NonNullable<V>>,
      nullable: false as NullishOf<V>,
    };
  }

  // 객체 스펙
  const { type, nullable, ...rest } = spec as {
    type: ColumnType | ColumnTypeOf<NonNullable<V>>;
    nullable?: boolean;
  } & Partial<Omit<ColumnSpecNorm<V>, 'type' | 'nullable'>>;

  return {
    type: type as ColumnTypeOf<NonNullable<V>>,
    nullable: (nullable === true ? true : false) as NullishOf<V>,
    ...(rest as Omit<ColumnSpecNorm<V>, 'type' | 'nullable'>),
  };
};

export const normalizeColumns = <T extends Record<string, unknown>>(
  input: ColumnMapInput<T>,
): ColumnMapNorm<T> => {
  const entries = typedEntries(input).map(([k, spec]) => [k, normalizeSpec(spec)]);
  return Object.fromEntries(entries) as ColumnMapNorm<T>;
};