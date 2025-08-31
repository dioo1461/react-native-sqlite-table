export type DBPrimitive = string | number | boolean | Uint8Array | null;

export interface Serializer<T> {
  jsonObjectToBlob(value: T): DBPrimitive;
  blobToJsonObject(value: DBPrimitive): T;
}

export const jsonSerializer: Serializer<unknown> = {
  jsonObjectToBlob: value => JSON.stringify(value),
  blobToJsonObject: value => {
    if (typeof value !== 'string') {
      throw new Error('value must be string for deserialization: BlobToJson');
    }
    return JSON.parse(value);
  },
};
