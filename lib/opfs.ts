// Folio — OPFS (Origin Private File System) primitives.
// Thin, typed wrappers over navigator.storage so the rest of the app never
// touches the raw FileSystemDirectoryHandle API. `path` uses "/" separators and
// doubles as a file id (see types/FSNode).

import type { FSNode } from "@/types";

/**
 * Cached root directory handle. OPFS root lookup is async and relatively
 * cheap, but we only ever want one handle for the lifetime of the page.
 */
let rootHandle: FileSystemDirectoryHandle | null = null;

/** Resolve (and cache) the OPFS root directory. */
async function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (!rootHandle) {
    rootHandle = await navigator.storage.getDirectory();
  }
  return rootHandle;
}

// ── Write-event pub/sub ────────────────────────────────────────────────────
// Lets observers (e.g. the storage-quota hook) react after a file is written,
// without them having to poll or reach into the write path.
type WriteListener = () => void;
const writeListeners = new Set<WriteListener>();

/**
 * Subscribe to post-write notifications. Returns an unsubscribe function.
 * Notified after every successful {@link writeFile}.
 */
export function onOpfsWrite(listener: WriteListener): () => void {
  writeListeners.add(listener);
  return () => {
    writeListeners.delete(listener);
  };
}

function notifyWrite(): void {
  writeListeners.forEach((listener) => listener());
}

/** Used by tests to reset the cached root between cases. Not exported in app builds. */
export async function __resetRootForTests(): Promise<void> {
  rootHandle = null;
}

/**
 * Walk `path` from the root, returning the directory handle at that path.
 * When `create` is true, every missing segment is created on the way down.
 */
async function getDirHandle(
  path: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  const root = await getRoot();
  const parts = splitPath(path);
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

/**
 * Resolve the parent directory of `path` plus the leaf name. Parent segments
 * are always created so writing into a nested path never fails with a missing
 * intermediate folder.
 */
async function resolveParent(path: string): Promise<{
  parent: FileSystemDirectoryHandle;
  name: string;
}> {
  const parts = splitPath(path);
  if (parts.length === 0) {
    throw new Error(`opfs.resolveParent: path has no segments: "${path}"`);
  }
  const name = parts[parts.length - 1];
  const parent = await getDirHandle(parts.slice(0, -1).join("/"), true);
  return { parent, name };
}

function splitPath(path: string): string[] {
  return path
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Join path segments with "/" and normalise empty/whitespace parts away. */
function joinPath(...parts: string[]): string {
  return parts.flatMap(splitPath).join("/");
}

/**
 * Read a file's full text. Resolves the parent directory, opens the leaf file
 * handle, and returns its contents as a string.
 */
export async function readFile(path: string): Promise<string> {
  const { parent, name } = await resolveParent(path);
  const handle = await parent.getFileHandle(name);
  const file = await handle.getFile();
  return file.text();
}

/**
 * Write `content` to `path`, creating the file and any missing parent
 * directories along the way. The writable stream is always closed, even on
 * failure.
 */
export async function writeFile(
  path: string,
  content: string,
): Promise<void> {
  const { parent, name } = await resolveParent(path);
  const handle = await parent.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
  notifyWrite();
}

/** Delete a single file at `path`. Folders should use {@link deleteFolder}. */
export async function deleteFile(path: string): Promise<void> {
  const { parent, name } = await resolveParent(path);
  await parent.removeEntry(name);
}

/**
 * Create a folder at `path` (including any intermediate folders). Idempotent:
 * calling it on an existing folder is a no-op.
 */
export async function createFolder(path: string): Promise<void> {
  await getDirHandle(path, true);
}

/**
 * Delete a folder at `path` and everything beneath it. Uses recursive
 * `removeEntry`.
 */
export async function deleteFolder(path: string): Promise<void> {
  const { parent, name } = await resolveParent(path);
  await parent.removeEntry(name, { recursive: true });
}

/**
 * Rename an entry by copying its content to a new leaf name and removing the
 * old path. `newName` is a single path segment (no slashes). Returns the full
 * new path.
 *
 * OPFS has no native move, so we copy then delete. Currently scoped to files;
 * renaming a folder throws.
 */
export async function renameEntry(
  oldPath: string,
  newName: string,
): Promise<string> {
  if (newName.includes("/")) {
    throw new Error(`opfs.renameEntry: newName must be a single segment: "${newName}"`);
  }

  const parts = splitPath(oldPath);
  const newPath = joinPath(...parts.slice(0, -1), newName);

  const isDir = await pathIsFolder(oldPath);
  if (isDir) {
    throw new Error(`opfs.renameEntry: folder rename is not supported: "${oldPath}"`);
  }

  const content = await readFile(oldPath);
  await writeFile(newPath, content);
  await deleteFile(oldPath);
  return newPath;
}

/** True if `path` resolves to a folder rather than a file. */
async function pathIsFolder(path: string): Promise<boolean> {
  const parts = splitPath(path);
  if (parts.length === 0) return true; // root
  const name = parts[parts.length - 1];
  const parent = await getDirHandle(parts.slice(0, -1).join("/"), false);
  for await (const [entryName, handle] of parent.entries()) {
    if (entryName === name) return handle.kind === "directory";
  }
  return false;
}

/**
 * Recursively build the file tree under `dir` (defaults to root). Folders
 * carry a `children` array; entries are sorted folders-first, then
 * alphabetically by name at every level.
 *
 * @param dir    Directory handle to scan. Defaults to the OPFS root.
 * @param prefix Path prefix accumulated so far (used for recursion).
 */
export async function listTree(
  dir?: FileSystemDirectoryHandle,
  prefix?: string,
): Promise<FSNode[]> {
  const root = dir ?? (await getRoot());
  const base = prefix ?? "";
  const nodes: FSNode[] = [];

  for await (const [name, handle] of root.entries()) {
    const path = base ? joinPath(base, name) : name;
    if (handle.kind === "directory") {
      const children = await listTree(handle, path);
      nodes.push({ type: "folder", name, path, children });
    } else {
      nodes.push({ type: "file", name, path });
    }
  }

  nodes.sort(compareNodes);
  return nodes;
}

/** Folders first, then alphabetical by name. */
function compareNodes(a: FSNode, b: FSNode): number {
  if (a.type !== b.type) {
    return a.type === "folder" ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}
