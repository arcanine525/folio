import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetIndexedDbForTests } from "@/__mocks__/indexeddb";
import {
  __resetDbForTests,
  deleteCache,
  evictStaleCache,
  getAllMeta,
  getCache,
  getMeta,
  openDB,
  setCache,
  setMeta,
  CACHE_TTL_MS,
} from "@/lib/indexeddb";
import type { FileMeta } from "@/types";

function meta(partial: Partial<FileMeta>): FileMeta {
  return {
    path: "notes/a.md",
    wordCount: 10,
    readingTimeSeconds: 3,
    lastModified: 1000,
    tags: [],
    ...partial,
  };
}

describe("lib/indexeddb", () => {
  beforeEach(() => {
    __resetIndexedDbForTests();
    __resetDbForTests();
  });

  afterEach(() => {
    __resetIndexedDbForTests();
    __resetDbForTests();
  });

  it("opens the database and creates both object stores", async () => {
    const db = await openDB();
    expect(db.objectStoreNames.contains("file-meta")).toBe(true);
    expect(db.objectStoreNames.contains("ai-cache")).toBe(true);
  });

  it("returns the same database handle on repeated opens", async () => {
    const a = await openDB();
    const b = await openDB();
    expect(a).toBe(b);
  });

  it("returns undefined for missing file metadata", async () => {
    expect(await getMeta("missing.md")).toBeUndefined();
  });

  it("round-trips file metadata including the tags array", async () => {
    const m = meta({ path: "x.md", wordCount: 42, tags: ["meeting", "q3"] });
    await setMeta(m);
    expect(await getMeta("x.md")).toEqual(m);
  });

  it("getAllMeta returns every stored row", async () => {
    await setMeta(meta({ path: "a.md", tags: ["t1"] }));
    await setMeta(meta({ path: "b.md", tags: ["t2"] }));
    const all = await getAllMeta();
    expect(all.map((m) => m.path).sort()).toEqual(["a.md", "b.md"]);
    expect(all.flatMap((m) => m.tags).sort()).toEqual(["t1", "t2"]);
  });

  it("returns undefined for a missing cache key", async () => {
    expect(await getCache("nope")).toBeUndefined();
  });

  it("round-trips a cached response", async () => {
    await setCache("k1", "hello world");
    const hit = await getCache("k1");
    expect(hit?.response).toBe("hello world");
    expect(typeof hit?.createdAt).toBe("number");
  });

  it("deletes a cached response", async () => {
    await setCache("k2", "gone");
    await deleteCache("k2");
    expect(await getCache("k2")).toBeUndefined();
  });

  it("evicts stale cache entries but keeps fresh ones", async () => {
    const now = Date.now();
    // Fresh entry: created now. Stale entry: older than the TTL.
    await setCache("fresh", "f", now);
    await setCache("stale", "s", now - CACHE_TTL_MS - 1);

    await evictStaleCache();

    expect((await getCache("fresh"))?.response).toBe("f");
    expect(await getCache("stale")).toBeUndefined();
  });

  it("evicts stale entries when the database is opened", async () => {
    const now = Date.now();
    await setCache("warm", "w", now);
    await setCache("old", "o", now - CACHE_TTL_MS - 1_000);

    // Force a fresh open so the on-open eviction runs again.
    __resetDbForTests();
    await openDB();

    expect((await getCache("warm"))?.response).toBe("w");
    expect(await getCache("old")).toBeUndefined();
  });
});
