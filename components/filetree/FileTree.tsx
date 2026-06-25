"use client";

import { useCallback, useState, type ReactNode } from "react";
import { FileTreeItem } from "@/components/filetree/FileTreeItem";
import type { FSNode } from "@/types";

export interface FileTreeProps {
  /** Top-level nodes. Sorted folders-first at each level before rendering. */
  nodes: FSNode[];
  /** Forwarded to every `FileTreeItem`. */
  onActivate?: (node: FSNode) => void;
  onRename?: (node: FSNode) => void;
  onDelete?: (node: FSNode) => void;
  onNewFile?: (node: FSNode) => void;
  onNewFolder?: (node: FSNode) => void;
}

/** Folders first, then alphabetical by name. */
function compareNodes(a: FSNode, b: FSNode): number {
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * Recursive file tree. Folders are open by default and hold their expand state
 * locally (a set of collapsed paths). Depth is passed down so `FileTreeItem`
 * can indent each row by `depth * 14px`. Children are only rendered while the
 * parent folder is expanded. Nodes are sorted folders-first at each level as a
 * defensive mirror of `listTree`'s ordering.
 */
export function FileTree({
  nodes,
  onActivate,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
}: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggleExpand = useCallback((node: FSNode) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
  }, []);

  const renderNode = (node: FSNode, depth: number): ReactNode => {
    const isFolder = node.type === "folder";
    const expanded = !collapsed.has(node.path);
    const sortedChildren = isFolder
      ? [...(node.children ?? [])].sort(compareNodes)
      : [];
    return (
      <div key={node.path}>
        <FileTreeItem
          node={node}
          depth={depth}
          expanded={expanded}
          onActivate={onActivate}
          onToggleExpand={toggleExpand}
          onRename={onRename}
          onDelete={onDelete}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
        />
        {isFolder && expanded && sortedChildren.length > 0 && (
          <div role="group">
            {sortedChildren.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const sortedTop = [...nodes].sort(compareNodes);
  return (
    <div role="tree">
      {sortedTop.map((node) => renderNode(node, 0))}
    </div>
  );
}
