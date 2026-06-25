"use client";

import { useEffect, useRef } from "react";
import type { EditorView } from "@codemirror/view";
import { AppShell } from "@/components/layout/AppShell";
import { Editor } from "@/components/editor/Editor";
import { Preview } from "@/components/editor/Preview";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { AIPanel } from "@/components/ai/AIPanel";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { useEditor } from "@/hooks/useEditor";
import { useAppStore } from "@/store/appStore";

/** Demo content shown until OPFS file loading arrives in Phase 2. */
const WELCOME_DOC = `# Welcome to Folio

Your **personal markdown knowledge base** with an AI assistant. Type in the
left pane and watch it render live on the right.

## What works in Phase 1

- 3-panel layout: *files* · editor · AI assistant
- CodeMirror editor with GFM markdown
- Live preview with syntax highlighting
- Mermaid diagrams (see below)
- Edit / Split / Preview modes via the toolbar

> Tip: drag the thin dividers between panels to resize them.

### Inline formatting

You can write \`inline code\`, **bold**, *italic*, ~~strikethrough~~, and
[links](https://nextjs.org).

### A table

| Feature        | Status |
| -------------- | :----: |
| Live preview   |   ✅   |
| Mermaid        |   ✅   |
| OPFS save      |   ⏳   |

### Code block

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

### Mermaid diagram

\`\`\`mermaid
flowchart LR
  A[Write markdown] --> B{Render}
  B -->|Live| C[Preview]
  B -->|AI| D[Summaries]
\`\`\`
`;

interface EditorZoneProps {
  doc: string;
  onChange: (value: string) => void;
  viewRef: React.RefObject<EditorView | null>;
  mode: "split" | "source" | "preview";
  dirty?: boolean;
  saving?: boolean;
  wordCount?: number;
  readingTimeSeconds?: number;
}

/** Editor area: toolbar on top, then panes switched by editor mode. */
function EditorZone({ doc, onChange, viewRef, mode, dirty, saving, wordCount, readingTimeSeconds }: EditorZoneProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorToolbar
        content={doc}
        viewRef={viewRef}
        dirty={dirty}
        saving={saving}
        wordCount={wordCount}
        readingTimeSeconds={readingTimeSeconds}
      />
      <div className="flex min-h-0 flex-1">
        {mode !== "preview" && (
          <div
            className={`h-full min-w-0 overflow-hidden ${
              mode === "split" ? "w-1/2 border-r border-border" : "w-full"
            }`}
          >
            <Editor value={doc} onChange={onChange} viewRef={viewRef} />
          </div>
        )}
        {mode !== "source" && (
          <div
            className={`h-full min-w-0 ${
              mode === "split" ? "w-1/2" : "w-full"
            } bg-surface-primary`}
          >
            <Preview content={doc} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  const activeFileId = useAppStore((s) => s.activeFileId);
  const editorMode = useAppStore((s) => s.editorMode);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const viewRef = useRef<EditorView | null>(null);

  // useEditor is the sole writer of `content` — it loads on file switch and
  // autosaves on edit. Show the welcome doc only until a file is opened.
  const { content, handleChange, isDirty, saving, wordCount, readingTimeSeconds } = useEditor();
  const doc = activeFileId ? content : WELCOME_DOC;

  // ⌘, / Ctrl+, toggles the AI settings modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(!settingsOpen);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [settingsOpen, setSettingsOpen]);

  return (
    <>
      <AppShell
        editorZone={
          <EditorZone
            doc={doc}
            onChange={handleChange}
            viewRef={viewRef}
            mode={editorMode}
            dirty={isDirty}
            saving={saving}
            wordCount={activeFileId ? wordCount : undefined}
            readingTimeSeconds={activeFileId ? readingTimeSeconds : undefined}
          />
        }
        aiPanel={<AIPanel />}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
