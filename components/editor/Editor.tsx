"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { getAllMeta } from "@/lib/indexeddb";
import { suggestTags } from "@/lib/tagAutocomplete";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Receives the mounted EditorView so siblings (e.g. the toolbar) can run commands. */
  viewRef?: MutableRefObject<EditorView | null>;
}

/**
 * Full-height styling + word-wrap theme applied via CodeMirror's theme system
 * (the plan calls for `height: 100%` / `overflow: auto` on `.cm-scroller`).
 */
const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--color-surface-primary)" },
  ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-sans)" },
  ".cm-content": { padding: "16px 20px" },
  ".cm-gutters": {
    backgroundColor: "var(--color-surface-primary)",
    borderRight: "1px solid var(--color-border)",
    color: "var(--color-fg-muted)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-activeLine": { backgroundColor: "var(--color-surface-tertiary)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--color-surface-tertiary)" },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--color-accent-light)",
  },
});

/**
 * CodeMirror 6 wrapper.
 *
 * - Mounts the `EditorView` exactly once (`useEffect([], [])`).
 * - `updateListener` forwards document changes to `onChange` only when
 *   `update.docChanged` (skips selection/viewport updates).
 * - External `value` changes (e.g. opening another file) are applied via
 *   `view.dispatch()` without tearing down and recreating the editor.
 * - P4.3.4: a tag-autocomplete source offers known tags (from IndexedDB) when
 *   the cursor is inside the frontmatter `tags:` value.
 *
 * `onChange` is kept in a ref so the mount effect never needs to re-run.
 */

/**
 * Autocompletion source: offer known tags when editing the `tags:` frontmatter.
 * Delegates context detection to the pure `suggestTags` helper and reads the
 * tag set from the `file-meta` store on each invocation so it stays fresh.
 */
async function tagCompletions(ctx: CompletionContext): Promise<CompletionResult | null> {
  const word = ctx.matchBefore(/[\w-]+/);
  if (!word) return null;
  const doc = ctx.state.doc;
  const lines = doc.toString().split("\n");
  const lineNumber = doc.lineAt(ctx.pos).number;

  let known: string[] = [];
  try {
    const all = await getAllMeta();
    known = Array.from(new Set(all.flatMap((m) => m.tags)));
  } catch {
    /* no metadata yet — offer nothing */
  }

  const suggestions = suggestTags({ lines, lineNumber, partial: word.text }, known);
  if (!suggestions || suggestions.length === 0) return null;
  return {
    from: word.from,
    options: suggestions.map((label) => ({ label, type: "property" })),
    validFor: /[\w-]+/,
  };
}
export function Editor({ value, onChange, viewRef }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cmViewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount once.
  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          editorTheme,
          EditorView.lineWrapping,
          autocompletion({ override: [tagCompletions] }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: hostRef.current,
    });
    cmViewRef.current = view;
    if (viewRef) viewRef.current = view;

    return () => {
      view.destroy();
      cmViewRef.current = null;
      if (viewRef) viewRef.current = null;
    };
    // Mount once — `value` is only the initial document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external content changes without re-mounting.
  useEffect(() => {
    const view = cmViewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />;
}
