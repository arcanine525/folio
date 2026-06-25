import { useCallback, useEffect, useRef, useState } from "react";
import * as opfs from "@/lib/opfs";
import { bridgeRemove, bridgeUpdate, setSearchPort } from "@/lib/searchBridge";
import type {
  IndexableDoc,
  SearchFilter,
  SearchResult,
  WorkerInbound,
  WorkerOutbound,
} from "@/lib/searchIndex";
import type { FSNode } from "@/types";

export interface UseSearch {
  /** Current result set for the last search. */
  results: SearchResult[];
  /** True while a search is debouncing or the worker is computing. */
  loading: boolean;
  /** Debounced (150ms) search — posts to the worker; results arrive via state. */
  search: (query: string, filter?: SearchFilter) => void;
  /** Push a single-file re-index (after a save). */
  updateIndex: (doc: IndexableDoc) => void;
  /** Drop a file from the index (after a delete). */
  removeFromIndex: (path: string) => void;
}

/** Search debounce window before posting to the worker. */
const SEARCH_DEBOUNCE_MS = 150;

/** Flatten the tree into a depth-first list of `.md` file paths. */
function flattenMdPaths(nodes: FSNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      out.push(...flattenMdPaths(node.children ?? []));
    } else if (node.name.endsWith(".md")) {
      out.push(node.path);
    }
  }
  return out;
}

/** Last path segment (file name). */
function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Walk OPFS and read every `.md` file into an indexable document. Unreadable
 * files are skipped so one bad file never blocks indexing.
 */
async function readAllMdDocs(): Promise<IndexableDoc[]> {
  const tree = await opfs.listTree();
  const docs: IndexableDoc[] = [];
  for (const path of flattenMdPaths(tree)) {
    try {
      const content = await opfs.readFile(path);
      docs.push({ path, name: basename(path), content });
    } catch {
      /* skip unreadable file */
    }
  }
  return docs;
}

/**
 * Owns the search worker for the app lifetime. Creates it once on mount, sends
 * a bulk `index` of all `.md` files, answers `search` (debounced), and exposes
 * `updateIndex`/`removeFromIndex` plus a bridge port so useEditor/useFileTree
 * can keep the index fresh. The worker is terminated on unmount.
 */
export function useSearch(): UseSearch {
  const workerRef = useRef<Worker | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ query: string; filter?: SearchFilter } | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const worker = new Worker(
      new URL("../lib/search-worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
      const message = e.data;
      if (message.type === "results") {
        setResults(message.payload);
        setLoading(false);
      }
    };

    // Register the bridge so useEditor (saves) and useFileTree (deletes) can
    // push incremental updates to this worker.
    setSearchPort({
      update: (doc) => worker.postMessage({ type: "update", payload: doc } satisfies WorkerInbound),
      remove: (path) =>
        worker.postMessage({ type: "remove", payload: path } satisfies WorkerInbound),
    });

    // Bulk-index every existing .md file on startup.
    void (async () => {
      const docs = await readAllMdDocs();
      worker.postMessage({ type: "index", payload: docs } satisfies WorkerInbound);
    })();

    return () => {
      setSearchPort(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const search = useCallback((query: string, filter?: SearchFilter) => {
    pendingRef.current = { query, filter };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      const worker = workerRef.current;
      const pending = pendingRef.current;
      if (!worker || !pending) return;
      worker.postMessage({
        type: "search",
        payload: { query: pending.query, filter: pending.filter },
      } satisfies WorkerInbound);
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const updateIndex = useCallback((doc: IndexableDoc) => {
    workerRef.current?.postMessage({ type: "update", payload: doc } satisfies WorkerInbound);
  }, []);

  const removeFromIndex = useCallback((path: string) => {
    workerRef.current?.postMessage({ type: "remove", payload: path } satisfies WorkerInbound);
  }, []);

  return { results, loading, search, updateIndex, removeFromIndex };
}
