// Ambient augmentation for the File System Access API.
//
// The lib.dom.d.ts shipped with this project's TypeScript (5.9) types
// `FileSystemDirectoryHandle` with getDirectoryHandle/getFileHandle/removeEntry
// but omits the async-iteration surface (entries / keys / values /
// [Symbol.asyncIterator]). Those methods exist in every browser that ships OPFS,
// so we merge them in here rather than cast at each call site. This augments the
// lib declaration — it never overrides existing members.

export {};

declare global {
  interface FileSystemDirectoryHandle {
    /**
     * Async-iterate over `[name, handle]` pairs in this directory. Values are
     * the concrete union so a `kind` check narrows without casting.
     */
    entries(): AsyncIterableIterator<
      [string, FileSystemFileHandle | FileSystemDirectoryHandle]
    >;
    /** Async-iterate over entry names in this directory. */
    keys(): AsyncIterableIterator<string>;
    /**
     * Async-iterate over child handles in this directory. Concrete union so a
     * `kind` check narrows.
     */
    values(): AsyncIterableIterator<
      FileSystemFileHandle | FileSystemDirectoryHandle
    >;
    /** Default async iterator — yields `[name, handle]` pairs. */
    [Symbol.asyncIterator](): AsyncIterableIterator<
      [string, FileSystemFileHandle | FileSystemDirectoryHandle]
    >;
  }
}
