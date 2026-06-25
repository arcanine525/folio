// In-memory File System Access API mock for jsdom.
//
// OPFS (`navigator.storage.getDirectory`) and the FileSystemDirectoryHandle
// surface are absent in jsdom, so this module installs a minimal in-memory
// implementation that mirrors the subset of the API `lib/opfs.ts` uses. It is
// imported once from `vitest.setup.ts` before any test module loads.
//
// The store is module-level and stable across calls (like the real root); tests
// reset it between cases via `__resetOpfs()` plus `__resetRootForTests()` in
// lib/opfs (which clears the cached handle).

type Entry = MockFileHandle | MockDirHandle;

interface FsCreateOptions {
  create?: boolean;
}
interface FsRemoveOptions {
  recursive?: boolean;
}

/** A minimal, File-like object exposing only `.text()` (all lib/opfs reads). */
interface FileLike {
  name: string;
  size: number;
  type: string;
  text(): Promise<string>;
}

function makeError(name: string, message: string): DOMException {
  // jsdom provides DOMException with a name-aware constructor.
  return new DOMException(message, name);
}

class MockFileHandle {
  readonly kind = "file" as const;
  constructor(readonly name: string, public content = "") {}

  async getFile(): Promise<FileLike> {
    const content = this.content;
    const name = this.name;
    return {
      name,
      size: content.length,
      type: "text/plain",
      async text() {
        return content;
      },
    };
  }

  async createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }> {
    let pending = this.content;
    return {
      write: async (data: string) => {
        pending = data;
      },
      close: async () => {
        // Arrow captures the method's `this` (the instance) without aliasing it.
        this.content = pending;
      },
    };
  }
}

class MockDirHandle {
  readonly kind = "directory" as const;
  readonly entriesMap = new Map<string, Entry>();
  constructor(readonly name = "") {}

  async getDirectoryHandle(
    name: string,
    opts: FsCreateOptions = {},
  ): Promise<MockDirHandle> {
    const existing = this.entriesMap.get(name);
    if (existing) {
      if (existing.kind !== "directory") {
        throw makeError("TypeMismatchError", `Entry "${name}" is not a directory`);
      }
      return existing;
    }
    if (!opts.create) {
      throw makeError("NotFoundError", `Directory "${name}" not found`);
    }
    const dir = new MockDirHandle(name);
    this.entriesMap.set(name, dir);
    return dir;
  }

  async getFileHandle(
    name: string,
    opts: FsCreateOptions = {},
  ): Promise<MockFileHandle> {
    const existing = this.entriesMap.get(name);
    if (existing) {
      if (existing.kind !== "file") {
        throw makeError("TypeMismatchError", `Entry "${name}" is not a file`);
      }
      return existing;
    }
    if (!opts.create) {
      throw makeError("NotFoundError", `File "${name}" not found`);
    }
    const file = new MockFileHandle(name);
    this.entriesMap.set(name, file);
    return file;
  }

  async removeEntry(name: string, opts: FsRemoveOptions = {}): Promise<void> {
    const existing = this.entriesMap.get(name);
    if (!existing) {
      throw makeError("NotFoundError", `Entry "${name}" not found`);
    }
    if (
      existing.kind === "directory" &&
      existing.entriesMap.size > 0 &&
      !opts.recursive
    ) {
      throw makeError(
        "InvalidModificationError",
        `Directory "${name}" is not empty`,
      );
    }
    this.entriesMap.delete(name);
  }

  async *entries(): AsyncIterableIterator<[string, Entry]> {
    for (const [name, handle] of this.entriesMap) {
      yield [name, handle];
    }
  }
}

// Module-level store, mirroring the real single root handle.
let root: MockDirHandle = new MockDirHandle("");

/** Wipe the in-memory store back to an empty root. Call between tests. */
export function __resetOpfs(): void {
  root = new MockDirHandle("");
}

/** Backing map of the current root — tests may assert against it directly. */
export function __opfsRoot(): MockDirHandle {
  return root;
}

const storage = {
  async getDirectory(): Promise<MockDirHandle> {
    return root;
  },
  async estimate(): Promise<{ usage: number; quota: number }> {
    return { usage: 0, quota: 1024 * 1024 * 1024 };
  },
};

// Install onto the jsdom navigator. `configurable: true` lets repeated
// test-process loads redefine cleanly.
Object.defineProperty(navigator, "storage", {
  value: storage,
  configurable: true,
});
