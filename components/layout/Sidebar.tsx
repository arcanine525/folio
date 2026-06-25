"use client";

import { useCallback, useState } from "react";
import { FileTree } from "@/components/filetree/FileTree";
import { NewItemInput } from "@/components/filetree/NewItemInput";
import { StorageQuotaBanner } from "@/components/StorageQuotaBanner";
import { useFileTree } from "@/hooks/useFileTree";
import { useStorageQuota } from "@/hooks/useStorageQuota";
import { useAppStore } from "@/store/appStore";
import type { FSNode } from "@/types";

type Creating = { kind: "file" | "folder"; parent: string };

/** Folder portion of a path ("" for top-level entries). */
function parentOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

/**
 * Sidebar: storage-quota banner, header (FILES + new file), scrollable file
 * tree with inline create/rename, and the upload footer. The tree, dirty flags,
 * and create/rename/delete actions are wired to `useFileTree` + the store.
 */
export function Sidebar() {
  const { tree, createFile, createFolder, deleteNode, renameNode } =
    useFileTree();
  const activeFileId = useAppStore((s) => s.activeFileId);
  const content = useAppStore((s) => s.content);
  const savedContent = useAppStore((s) => s.savedContent);
  const setActiveFile = useAppStore((s) => s.setActiveFile);
  const quota = useStorageQuota();

  const [creating, setCreating] = useState<Creating | null>(null);
  const [renaming, setRenaming] = useState<FSNode | null>(null);

  // Only the active file can be dirty under autosave.
  const isDirty = useCallback(
    (node: FSNode) =>
      node.type === "file" &&
      node.path === activeFileId &&
      content !== savedContent,
    [activeFileId, content, savedContent],
  );

  const handleCreateCommit = useCallback(
    async (name: string) => {
      const target = creating;
      setCreating(null);
      if (!target) return;
      const path = target.parent ? `${target.parent}/${name}` : name;
      if (target.kind === "file") {
        await createFile(path, "");
        setActiveFile(path);
      } else {
        await createFolder(path);
      }
    },
    [creating, createFile, createFolder, setActiveFile],
  );

  const handleRenameCommit = useCallback(
    async (name: string) => {
      const node = renaming;
      setRenaming(null);
      if (!node) return;
      const parent = parentOf(node.path);
      const newPath = parent ? `${parent}/${name}` : name;
      await renameNode(node, name);
      if (node.type === "file") setActiveFile(newPath);
    },
    [renaming, renameNode, setActiveFile],
  );

  const newIn = useCallback((node: FSNode, kind: "file" | "folder") => {
    const parent = node.type === "folder" ? node.path : parentOf(node.path);
    setRenaming(null);
    setCreating({ kind, parent });
  }, []);

  return (
    <aside className="flex h-full min-w-0 flex-col border-r border-border bg-surface-tertiary shadow-panel">
      <StorageQuotaBanner visible={quota.showBanner} onDismiss={quota.dismiss} />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <span className="font-caption text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
          Files
        </span>
        <button
          type="button"
          aria-label="New file"
          onClick={() => {
            setRenaming(null);
            setCreating({ kind: "file", parent: "" });
          }}
          className="flex h-5 w-5 items-center justify-center rounded-chip text-fg-secondary transition-colors hover:bg-surface-secondary hover:text-fg-primary"
        >
          <span className="text-sm leading-none">+</span>
        </button>
      </div>

      {/* File tree + inline create/rename input */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {creating && (
          <NewItemInput
            placeholder={
              creating.kind === "file" ? "File name…" : "Folder name…"
            }
            onCommit={handleCreateCommit}
            onCancel={() => setCreating(null)}
          />
        )}
        {renaming && (
          <NewItemInput
            defaultValue={renaming.name}
            onCommit={handleRenameCommit}
            onCancel={() => setRenaming(null)}
          />
        )}
        <FileTree
          nodes={tree}
          isDirty={isDirty}
          onActivate={(node) => setActiveFile(node.path)}
          onDelete={(node) => void deleteNode(node)}
          onRename={(node) => {
            setCreating(null);
            setRenaming(node);
          }}
          onNewFile={(node) => newIn(node, "file")}
          onNewFolder={(node) => newIn(node, "folder")}
        />
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-3">
        <button
          type="button"
          className="font-caption w-full rounded-chip border border-border bg-surface-primary px-2 py-2 text-xs text-fg-secondary transition-colors hover:text-fg-primary"
        >
          Upload audio / transcript
        </button>
      </div>
    </aside>
  );
}
