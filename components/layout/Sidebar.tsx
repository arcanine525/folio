"use client";

/**
 * Sidebar shell. Phase 1: placeholder layout (header, empty tree area, footer).
 * Phase 2 mounts the real `<FileTree>` into the scroll area and wires the
 * "new file" + "upload" actions.
 */
export function Sidebar() {
  return (
    <aside className="flex h-full min-w-0 flex-col border-r border-border bg-surface-tertiary shadow-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <span className="font-caption text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
          Files
        </span>
        <button
          type="button"
          aria-label="New file"
          className="flex h-5 w-5 items-center justify-center rounded-chip text-fg-secondary transition-colors hover:bg-surface-secondary hover:text-fg-primary"
        >
          <span className="text-sm leading-none">+</span>
        </button>
      </div>

      {/* File tree mount point (Phase 2) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <p className="font-caption px-2 py-6 text-xs leading-relaxed text-fg-muted">
          Your files will appear here once OPFS persistence lands in Phase 2.
        </p>
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
