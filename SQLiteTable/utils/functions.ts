type StringKeys<T> = Extract<keyof T, string>;

export const typedEntries = <O extends Record<string, unknown>>(obj: O) =>
  Object.entries(obj) as Array<[string, O[StringKeys<O>]]>;
