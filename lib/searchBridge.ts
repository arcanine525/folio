// Folio — search-worker bridge (P4.5.4 / P4.5.5).
//
// The search worker is owned by the useSearch hook mounted once at the app
// root. Other modules (useEditor after a save, useFileTree after a delete) need
// to push incremental index updates without a handle to that hook instance, so
// useSearch registers a `port` here on mount and unregisters on unmount. The
// bridge is a thin pass-through; it's a no-op until the worker is registered.

import type { IndexableDoc } from "@/lib/searchIndex";

/** Interface useSearch registers against the running worker. */
export interface SearchPort {
  update(doc: IndexableDoc): void;
  remove(path: string): void;
}

let port: SearchPort | null = null;

/** Called by useSearch on mount (with a port) and unmount (with null). */
export function setSearchPort(next: SearchPort | null): void {
  port = next;
}

/** Re-index a single file after a save. No-op if no worker is mounted. */
export function bridgeUpdate(doc: IndexableDoc): void {
  port?.update(doc);
}

/** Drop a file from the index after a delete. No-op if no worker is mounted. */
export function bridgeRemove(path: string): void {
  port?.remove(path);
}
