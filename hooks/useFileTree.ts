import { useCallback, useEffect, useState } from "react";
import * as opfs from "@/lib/opfs";
import { bridgeRemove } from "@/lib/searchBridge";
import { useAppStore } from "@/store/appStore";
import type { FSNode } from "@/types";

export interface UseFileTree {
  /** Mirrors `store.tree` — the OPFS-backed file tree. */
  tree: FSNode[];
  /** True until the initial mount scan completes. */
  loading: boolean;
  /** Re-scan OPFS and write the result into the store. */
  refresh: () => Promise<void>;
  /** Persist a new file (defaulting to empty) and refresh. Returns its path. */
  createFile: (path: string, content?: string) => Promise<string>;
  /** Persist a new folder and refresh. */
  createFolder: (path: string) => Promise<void>;
  /** Delete a file or folder (branched on `node.type`) and refresh. */
  deleteNode: (node: FSNode) => Promise<void>;
  /** Rename a node's leaf and refresh. Returns the new path. */
  renameNode: (node: FSNode, newName: string) => Promise<string>;
}

/**
 * Bridges OPFS primitives to the Zustand `tree`. Scans OPFS once on mount and
 * exposes mutating helpers that write-through then re-scan, so the tree always
 * mirrors what's on disk.
 */
export function useFileTree(): UseFileTree {
  const tree = useAppStore((s) => s.tree);
  const setTree = useAppStore((s) => s.setTree);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await opfs.listTree();
    setTree(next);
    setLoading(false);
  }, [setTree]);

  // Trigger the initial OPFS scan exactly once on mount. State is set after the
  // async resolve (not synchronously), so this is a fetch-on-mount, not a
  // derived-state effect — the lint rule can't see the await boundary.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const createFile = useCallback(
    async (path: string, content = ""): Promise<string> => {
      await opfs.writeFile(path, content);
      await refresh();
      return path;
    },
    [refresh],
  );

  const createFolder = useCallback(
    async (path: string): Promise<void> => {
      await opfs.createFolder(path);
      await refresh();
    },
    [refresh],
  );

  const deleteNode = useCallback(
    async (node: FSNode): Promise<void> => {
      if (node.type === "file") {
        await opfs.deleteFile(node.path);
        // P4.5.5: drop the deleted file from the live search index.
        bridgeRemove(node.path);
      } else {
        await opfs.deleteFolder(node.path);
      }
      await refresh();
    },
    [refresh],
  );

  const renameNode = useCallback(
    async (node: FSNode, newName: string): Promise<string> => {
      const newPath = await opfs.renameEntry(node.path, newName);
      await refresh();
      return newPath;
    },
    [refresh],
  );

  return {
    tree,
    loading,
    refresh,
    createFile,
    createFolder,
    deleteNode,
    renameNode,
  };
}
