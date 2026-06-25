"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

export interface NewItemInputProps {
  /** Called with the trimmed name when the user presses Enter (non-empty). */
  onCommit: (name: string) => void;
  /** Called on Escape (or an empty Enter) — nothing is created. */
  onCancel: () => void;
  /** Nesting depth — indents the input to align with sibling rows. */
  depth?: number;
  placeholder?: string;
  /** Pre-fill (and select) for rename flows. */
  defaultValue?: string;
}

/**
 * Inline text input shown in place of a file/folder row when creating or
 * renaming. Auto-focuses on mount, commits the trimmed value on Enter, and
 * cancels (no-op) on Escape or an empty Enter. The parent decides whether the
 * committed name becomes a file or a folder.
 */
export function NewItemInput({
  onCommit,
  onCancel,
  depth = 0,
  placeholder = "Name…",
  defaultValue = "",
}: NewItemInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    if (defaultValue) ref.current?.select();
    // Mount-only: focus + select once when the input appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const name = e.currentTarget.value.trim();
      if (name) onCommit(name);
      else onCancel();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      style={{ paddingLeft: 8 + depth * 14 }}
      className="flex h-7 items-center pr-2"
    >
      <input
        ref={ref}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        className="font-sans h-6 w-full rounded-chip border border-accent bg-surface-primary px-2 text-xs text-fg-primary outline-none"
      />
    </div>
  );
}
