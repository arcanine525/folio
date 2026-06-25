"use client";

import { type MutableRefObject } from "react";
import { EditorView } from "@codemirror/view";
import { useAppStore } from "@/store/appStore";
import type { EditorMode } from "@/store/appStore";

interface EditorToolbarProps {
  /** Current buffer content, used for the word count + reading time. */
  content: string;
  /** Editor view shared with <Editor> — drives the format buttons. */
  viewRef: MutableRefObject<EditorView | null>;
  /** True when there are unsaved edits. Phase 2 wires this from useEditor. */
  dirty?: boolean;
  /** True while a debounced save is flushing to OPFS. */
  saving?: boolean;
}

/** Wrap the current selection (or insert a placeholder) with `token` on both sides. */
function surround(view: EditorView, token: string, placeholder = "text"): void {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.doc.sliceString(range.from, range.to) || placeholder;
  const insert = `${token}${selected}${token}`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: {
      anchor: range.from + token.length,
      head: range.from + token.length + selected.length,
    },
  });
  view.focus();
}

/** Toggle a line prefix (e.g. "# " for H1) on every selected line. */
function toggleLinePrefix(view: EditorView, prefix: string): void {
  const { state } = view;
  const range = state.selection.main;
  const startLine = state.doc.lineAt(range.from);
  const endLine = state.doc.lineAt(range.to);
  const changes = [];
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = state.doc.line(n);
    const has = line.text.startsWith(prefix);
    changes.push(
      has
        ? { from: line.from, to: line.from + prefix.length, insert: "" }
        : { from: line.from, insert: prefix },
    );
  }
  view.dispatch({ changes });
  view.focus();
}

/** Wrap the selection in a fenced code block. */
function wrapCodeBlock(view: EditorView): void {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.doc.sliceString(range.from, range.to) || "code";
  const insert = `\n\`\`\`\n${selected}\n\`\`\`\n`;
  view.dispatch({ changes: { from: range.from, to: range.to, insert } });
  view.focus();
}

const FORMAT_BUTTONS: {
  label: string;
  title: string;
  run: (v: EditorView) => void;
}[] = [
  { label: "B", title: "Bold", run: (v) => surround(v, "**", "bold") },
  { label: "I", title: "Italic", run: (v) => surround(v, "*", "italic") },
  { label: "H1", title: "Heading 1", run: (v) => toggleLinePrefix(v, "# ") },
  { label: "H2", title: "Heading 2", run: (v) => toggleLinePrefix(v, "## ") },
  { label: "S", title: "Strikethrough", run: (v) => surround(v, "~~", "text") },
  { label: "<>", title: "Inline code", run: (v) => surround(v, "`", "code") },
  { label: "{ }", title: "Code block", run: (v) => wrapCodeBlock(v) },
];

const VIEW_MODES: EditorMode[] = ["source", "split", "preview"];

function countWords(text: string): number {
  const stripped = text.replace(/---[\s\S]*?---/, "").trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).filter(Boolean).length;
}

export function EditorToolbar({
  content,
  viewRef,
  dirty = false,
  saving = false,
}: EditorToolbarProps) {
  const editorMode = useAppStore((s) => s.editorMode);
  const setEditorMode = useAppStore((s) => s.setEditorMode);

  const words = countWords(content);
  const readingMinutes = Math.max(1, Math.round(words / 240));

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-primary px-3 py-2">
      {/* Format buttons */}
      <div className="flex items-center gap-1">
        {FORMAT_BUTTONS.map((btn) => (
          <button
            key={btn.label}
            type="button"
            title={btn.title}
            onClick={() => viewRef.current && btn.run(viewRef.current)}
            className="font-heading h-7 min-w-7 rounded-chip px-1.5 text-[11px] font-bold text-fg-secondary transition-colors hover:bg-surface-secondary hover:text-fg-primary"
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* View mode toggle + meta */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-0.5 rounded-chip bg-surface-secondary p-0.5">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setEditorMode(mode)}
              className={`font-heading rounded-chip px-2 py-1 text-[11px] capitalize transition-colors ${
                editorMode === mode
                  ? "bg-accent-light font-semibold text-accent"
                  : "text-fg-secondary hover:text-fg-primary"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="font-caption flex items-center gap-2 text-[11px] text-fg-muted">
          <span>
            {words.toLocaleString()} words · {readingMinutes} min read
          </span>
          {saving ? (
            <span className="text-fg-secondary">Saving…</span>
          ) : dirty ? (
            <span className="text-fg-secondary">● Unsaved</span>
          ) : (
            <span className="text-success">● Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
