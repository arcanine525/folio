// Folio — IndexedDB metadata + AI cache layer (P4.1).
//
// Two object stores live in the `folio-meta` database (version 1):
//
//   file-meta   keyPath: 'path'    → FileMeta { path, wordCount,
//                                            readingTimeSeconds, lastModified, tags }
//   ai-cache    keyPath: 'cacheKey' → AiCacheEntry { cacheKey, response, createdAt }
//
// The cache is evicted lazily: every time the DB is opened, entries older than
// 7 days are deleted (P4.1.4). Wrappers are thin over the standard IDB request
// API; jsdom lacks IndexedDB, so tests run against __mocks__/indexeddb.ts.

import type { FileMeta } from "@/types";

const DB_NAME = "folio-meta";
const DB_VERSION = 1;
const META_STORE = "file-meta";
const CACHE_STORE = "ai-cache";

/** A cached AI response, keyed by a SHA-256 of its inputs (see lib/cacheKey). */
export interface AiCacheEntry {
  cacheKey: string;
  response: string;
  createdAt: number;
}

/** Cache entries older than this are evicted when the DB opens. */
export const CACHE_TTL_MS = 7 * 86_400_000; // 7 days

/** Cached open promise so the DB is opened exactly once per page session. */
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open (or upgrade) `folio-meta`. On upgrade it creates both object stores; on
 * every successful open it kicks off a stale-cache eviction. Rejects if
 * IndexedDB is unavailable (e.g. SSR / private mode).
 */
export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this environment"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "path" });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "cacheKey" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Evict stale cache entries before resolving so callers never see expired data.
      void evictStaleCache(db).finally(() => resolve(db));
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * Delete `ai-cache` entries older than {@link CACHE_TTL_MS}. Reads all entries
 * then deletes the stale ones — the cache is small, so `getAll` + targeted
 * deletes is simpler and less error-prone than a cursor walk.
 */
export async function evictStaleCache(db?: IDBDatabase): Promise<void> {
  const database = db ?? (await openDB());
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(CACHE_STORE, "readwrite");
    const store = tx.objectStore(CACHE_STORE);
    const stale: string[] = [];
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const now = Date.now();
      for (const entry of getAllReq.result as AiCacheEntry[]) {
        if (now - entry.createdAt > CACHE_TTL_MS) stale.push(entry.cacheKey);
      }
      for (const key of stale) store.delete(key);
    };
    getAllReq.onerror = () => reject(getAllReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Run a single-store request inside its own transaction and await its result. */
function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ── file-meta helpers ───────────────────────────────────────────────────────

/** Read one file's metadata, or `undefined` if it has never been computed. */
export function getMeta(path: string): Promise<FileMeta | undefined> {
  return runRequest<FileMeta | undefined>(META_STORE, "readonly", (store) =>
    store.get(path) as IDBRequest<FileMeta | undefined>,
  );
}

/** Upsert a file's metadata row. */
export function setMeta(meta: FileMeta): Promise<void> {
  return runRequest(META_STORE, "readwrite", (store) => store.put(meta)).then(() => undefined);
}

/** Every metadata row in the store (used to power tag autocomplete, P4.3.4). */
export function getAllMeta(): Promise<FileMeta[]> {
  return runRequest<FileMeta[]>(META_STORE, "readonly", (store) =>
    store.getAll() as IDBRequest<FileMeta[]>,
  );
}

// ── ai-cache helpers ────────────────────────────────────────────────────────

/** Read a cached response, or `undefined` on a miss. */
export function getCache(key: string): Promise<AiCacheEntry | undefined> {
  return runRequest<AiCacheEntry | undefined>(CACHE_STORE, "readonly", (store) =>
    store.get(key) as IDBRequest<AiCacheEntry | undefined>,
  );
}

/**
 * Store a cached response. `createdAt` defaults to now but is overridable so
 * eviction can be exercised in tests without waiting.
 */
export function setCache(key: string, response: string, createdAt: number = Date.now()): Promise<void> {
  const entry: AiCacheEntry = { cacheKey: key, response, createdAt };
  return runRequest(CACHE_STORE, "readwrite", (store) => store.put(entry)).then(() => undefined);
}

/** Remove a single cached response. */
export function deleteCache(key: string): Promise<void> {
  return runRequest(CACHE_STORE, "readwrite", (store) => store.delete(key)).then(() => undefined);
}

/** Test-only: drop the cached open promise so the next access re-opens the DB. */
export function __resetDbForTests(): void {
  dbPromise = null;
}
