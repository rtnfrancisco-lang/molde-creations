/* Wrapper mínimo de IndexedDB: banco "moldecore", store "kv". Valores guardados por structured clone. */

const DB = "moldecore";
const STORE = "kv";
let dbp: Promise<IDBDatabase> | null = null;

export const hasIdb = () => typeof indexedDB !== "undefined";

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error("IndexedDB bloqueado"));
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest | void,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transação abortada"));
  });
}

export const get = <T = unknown>(key: string) => run<T | undefined>("readonly", (s) => s.get(key));
export const set = (key: string, value: unknown) =>
  run<void>("readwrite", (s) => void s.put(value, key));
export const del = (key: string) => run<void>("readwrite", (s) => void s.delete(key));
export const keys = () => run<string[]>("readonly", (s) => s.getAllKeys() as IDBRequest);
/** Grava várias chaves em UMA transação (tudo ou nada). */
export const setMany = (entries: Record<string, unknown>) =>
  run<void>("readwrite", (s) => {
    for (const [k, v] of Object.entries(entries)) s.put(v, k);
  });
export const clear = () => run<void>("readwrite", (s) => void s.clear());
