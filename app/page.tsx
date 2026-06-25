"use client";

import { useRef } from "react";
import type { EditorView } from "@codemirror/view";
import { AppShell } from "@/components/layout/AppShell";
import { Editor } from "@/components/editor/Editor";
import { Preview } from "@/components/editor/Preview";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
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
}

/** Editor area: toolbar on top, then panes switched by editor mode. */
function EditorZone({ doc, onChange, viewRef, mode }: EditorZoneProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorToolbar content={doc} viewRef={viewRef} />
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
  const content = useAppStore((s) => s.content);
  const setContent = useAppStore((s) => s.setContent);
  const editorMode = useAppStore((s) => s.editorMode);
  const viewRef = useRef<EditorView | null>(null);

  // Phase 1 has no persistence; fall back to the welcome doc when empty.
  const doc = content || WELCOME_DOC;

  return (
    <AppShell
      editorZone={
        <EditorZone
          doc={doc}
          onChange={setContent}
          viewRef={viewRef}
          mode={editorMode}
        />
      }
    />
  );
}
