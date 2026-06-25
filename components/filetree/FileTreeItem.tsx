"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { FSNode } from "@/types";

export interface FileTreeItemProps {
  node: FSNode;
  /** Nesting depth — drives left indent (depth * 14px). */
  depth: number;
  /** True when this is the active file (drives accent treatment). */
  active?: boolean;
  /** True when the file has unsaved edits (shows the accent dot). */
  dirty?: boolean;
  /** Folder expand state (drives chevron direction). */
  expanded?: boolean;
  /** Left-click on a file (folders toggle expand instead). */
  onActivate?: (node: FSNode) => void;
  /** Click on a folder chevron/label to expand or collapse. */
  onToggleExpand?: (node: FSNode) => void;
  /** Context-menu actions. */
  onRename?: (node: FSNode) => void;
  onDelete?: (node: FSNode) => void;
  onNewFile?: (node: FSNode) => void;
  onNewFolder?: (node: FSNode) => void;
}

interface MenuPos {
  x: number;
  y: number;
}

/**
 * One row of the file tree. Presentational and store-agnostic: the parent
 * (`FileTree`) supplies state and wires callbacks to the store / hooks. Active,
 * non-active, and folder rows each get their own Minimal Ink treatment, and a
 * right-click opens an inline context menu (Rename · Delete · New file · New
 * folder) that closes on outside-click or Escape.
 */
export function FileTreeItem({
  node,
  depth,
  active = false,
  dirty = false,
  expanded = false,
  onActivate,
  onToggleExpand,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
}: FileTreeItemProps) {
  const [menu, setMenu] = useState<MenuPos | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isFolder = node.type === "folder";

  // Close the open menu on outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  const handleClick = () => {
    if (isFolder) onToggleExpand?.(node);
    else onActivate?.(node);
  };

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const labelClass = isFolder
    ? "font-heading text-xs font-medium text-fg-primary"
    : active
      ? "font-heading text-xs font-semibold text-accent"
      : "font-sans text-xs text-fg-secondary";

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        aria-current={active ? "true" : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={`flex h-7 cursor-pointer select-none items-center gap-1.5 pr-2 ${
          active ? "bg-accent-light" : "hover:bg-surface-secondary"
        }`}
      >
        {active && (
          <span
            aria-hidden
            className="absolute bottom-0 left-0 top-0 w-[3px] bg-accent"
          />
        )}

        {isFolder && <Chevron expanded={expanded} />}

        <span className={`flex-1 truncate ${labelClass}`}>{node.name}</span>

        {dirty && !isFolder && (
          <span
            aria-label="unsaved changes"
            className="font-caption text-[8px] leading-none text-accent"
          >
            ●
          </span>
        )}
      </div>

      {menu && (
        // TODO: replace with ui/ContextMenu (P7.6.5) once the shared primitive lands.
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", left: menu.x, top: menu.y }}
          className="z-50 w-40 overflow-hidden rounded-card border border-border bg-surface-primary shadow-modal"
        >
          <MenuItem label="Rename" onSelect={() => onRename?.(node)} onClose={setMenu} />
          <MenuItem label="Delete" onSelect={() => onDelete?.(node)} onClose={setMenu} />
          <MenuItem
            label="New file here"
            onSelect={() => onNewFile?.(node)}
            onClose={setMenu}
          />
          <MenuItem
            label="New folder here"
            onSelect={() => onNewFolder?.(node)}
            onClose={setMenu}
          />
        </div>
      )}
    </div>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden
      className={`shrink-0 text-fg-muted transition-transform ${
        expanded ? "rotate-90" : ""
      }`}
    >
      <path
        d="M3 1 L7 5 L3 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface MenuItemProps {
  label: string;
  onSelect: () => void;
  onClose: (pos: null) => void;
}

function MenuItem({ label, onSelect, onClose }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClose(null);
        onSelect();
      }}
      className="font-sans block w-full px-3 py-1.5 text-left text-xs text-fg-primary transition-colors hover:bg-accent-light hover:text-accent"
    >
      {label}
    </button>
  );
}
