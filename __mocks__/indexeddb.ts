// In-memory IndexedDB mock for jsdom.
//
// jsdom does not implement IndexedDB, so this installs a minimal subset of the
// real API covering exactly what lib/indexeddb.ts uses: `open` (with
// `onupgradeneeded` + `createObjectStore`), `transaction().objectStore()` with
// `get` / `getAll` / `put` / `delete`, request `onsuccess` / `onerror`, and
// `deleteDatabase`. It mirrors the hand-written approach of __mocks__/opfs.ts
// and is imported once from vitest.setup.ts before any test loads lib/indexeddb.
//
// Events fire as microtasks (real IndexedDB fires as tasks) which keeps the
// tests fast while remaining awaitable. `onupgradeneeded` always fires before
// `onsuccess`, matching the real ordering.

/** A key IndexedDB accepts — we only ever use strings. */
type ValidKey = string | number;

/** Extract the key from a stored value via its `keyPath` (single-segment only). */
function extractKey(value: unknown, keyPath: string | string[]): ValidKey {
  if (Array.isArray(keyPath)) {
    throw new DOMException("Mock IDB does not support array keyPaths", "DataError");
  }
  const v = (value as Record<string, unknown>)?.[keyPath];
  if (typeof v !== "string" && typeof v !== "number") {
    throw new DOMException(`No key at "${keyPath}"`, "DataError");
  }
  return v as ValidKey;
}

/** A minimal Event with just the fields the handlers read. */
function fakeEvent(type: string, target: unknown): unknown {
  return { type, target, currentTarget: target };
}

/** Outcome of a store operation, used to route success vs. error callbacks. */
type Outcome<T> = { ok: true; result: T } | { ok: false; error: unknown };

interface MockRequest<T = unknown> {
  result: T;
  error: unknown;
  source: unknown;
  transaction: MockTransaction | null;
  readyState: "pending" | "done";
  onsuccess: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onupgradeneeded: ((ev: unknown) => void) | null;
}

interface StoreDef {
  keyPath: string | string[];
  map: Map<ValidKey, unknown>;
}

class MockObjectStore {
  constructor(
    private readonly def: StoreDef,
    readonly tx: MockTransaction,
  ) {}

  get(key: ValidKey): MockRequest {
    return this.queue(() => {
      if (!this.def.map.has(key)) return { ok: true, result: undefined };
      return { ok: true, result: this.def.map.get(key) };
    });
  }

  getAll(): MockRequest {
    return this.queue(() => ({ ok: true, result: [...this.def.map.values()] }));
  }

  put(value: unknown): MockRequest {
    return this.queue(() => {
      const key = extractKey(value, this.def.keyPath);
      this.def.map.set(key, value);
      return { ok: true, result: key };
    });
  }

  delete(key: ValidKey): MockRequest {
    return this.queue(() => {
      this.def.map.delete(key);
      return { ok: true, result: undefined };
    });
  }

  /** Schedule an operation as a microtask, mirroring async IDB requests. */
  private queue<T>(run: () => Outcome<T>): MockRequest<T> {
    const req: MockRequest<T> = {
      result: undefined as T,
      error: null,
      source: this,
      transaction: this.tx,
      readyState: "pending",
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };
    queueMicrotask(() => {
      const outcome = run();
      req.readyState = "done";
      if (outcome.ok) {
        req.result = outcome.result;
        req.onsuccess?.(fakeEvent("success", req));
      } else {
        req.error = outcome.error;
        req.onerror?.(fakeEvent("error", req));
      }
    });
    return req;
  }
}

class MockTransaction {
  oncomplete: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(
    private readonly db: MockDatabase,
    readonly storeNames: string[],
    readonly mode: string,
  ) {
    // Real IndexedDB fires transaction completion as a *task* after every
    // queued request microtask has drained. setTimeout(0) reproduces that
    // ordering so `tx.oncomplete` resolves once the store ops are done.
    setTimeout(() => this.oncomplete?.(fakeEvent("complete", this)), 0);
  }

  objectStore(name: string): MockObjectStore {
    const def = this.db.stores.get(name);
    if (!def) throw new DOMException(`Object store "${name}" not found`, "NotFoundError");
    return new MockObjectStore(def, this);
  }
}

/** A string-list-like with the `contains` method lib/indexeddb reads. */
function stringList(names: string[]): { contains: (n: string) => boolean; length: number; item: (i: number) => string | undefined } {
  return {
    contains: (n) => names.includes(n),
    length: names.length,
    item: (i) => names[i],
  };
}

class MockDatabase {
  readonly stores = new Map<string, StoreDef>();
  constructor(
    readonly name: string,
    public version: number,
  ) {}

  get objectStoreNames() {
    return stringList([...this.stores.keys()]);
  }

  createObjectStore(name: string, options: { keyPath?: string | string[] }): MockObjectStore {
    if (this.stores.has(name)) {
      throw new DOMException(`Object store "${name}" already exists`, "ConstraintError");
    }
    const def: StoreDef = { keyPath: options.keyPath ?? "id", map: new Map() };
    this.stores.set(name, def);
    return new MockObjectStore(def, new MockTransaction(this, [name], "versionchange"));
  }

  transaction(stores: string | string[], mode = "readonly"): MockTransaction {
    const names = Array.isArray(stores) ? stores : [stores];
    for (const n of names) {
      if (!this.stores.has(n)) {
        throw new DOMException(`Object store "${n}" not found`, "NotFoundError");
      }
    }
    return new MockTransaction(this, names, mode);
  }

  close(): void {
    /* no-op: the in-memory stores live on the db instance */
  }
}

// Module-level registry of named databases, mirroring the browser's origin map.
const databases = new Map<string, MockDatabase>();

interface MockIDBFactory {
  open(name: string, version?: number): MockRequest<MockDatabase>;
  deleteDatabase(name: string): MockRequest<undefined>;
}

const factory: MockIDBFactory = {
  open(name, version = 1): MockRequest<MockDatabase> {
    const existing = databases.get(name);
    const needUpgrade = !existing || existing.version < version;
    const db = needUpgrade ? new MockDatabase(name, version as number) : existing;

    const req: MockRequest<MockDatabase> = {
      result: undefined as unknown as MockDatabase,
      error: null,
      source: null,
      transaction: null,
      readyState: "pending",
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };

    queueMicrotask(() => {
      if (needUpgrade) {
        // versionchange transaction — store creation happens in the handler.
        // `req.result` is the database handle during onupgradeneeded, matching
        // real IndexedDB (the canonical `event.target.result` pattern).
        req.result = db;
        req.transaction = new MockTransaction(db, [...db.stores.keys()], "versionchange");
        db.version = version as number;
        req.readyState = "done";
        req.onupgradeneeded?.(fakeEvent("upgradeneeded", req));
        databases.set(name, db);
        queueMicrotask(() => {
          req.onsuccess?.(fakeEvent("success", req));
        });
      } else {
        req.readyState = "done";
        req.result = db;
        req.onsuccess?.(fakeEvent("success", req));
      }
    });
    return req;
  },

  deleteDatabase(name): MockRequest<undefined> {
    const req: MockRequest<undefined> = {
      result: undefined,
      error: null,
      source: null,
      transaction: null,
      readyState: "pending",
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };
    queueMicrotask(() => {
      databases.delete(name);
      req.readyState = "done";
      req.onsuccess?.(fakeEvent("success", req));
    });
    return req;
  },
};

/** Wipe all databases back to empty. Call between tests. */
export function __resetIndexedDbForTests(): void {
  databases.clear();
}

// Install onto the jsdom global. `configurable: true` lets repeated
// test-process loads redefine cleanly.
Object.defineProperty(globalThis, "indexedDB", {
  value: factory,
  configurable: true,
});
