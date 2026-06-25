# Folio — Implementation Plan

**App name:** Folio · **Alias:** `folio`  
**Tagline:** Your personal markdown knowledge base with AI assistant  

Browser-only markdown workspace with AI assistant, meeting transcript management, and multi-format export.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (Node.js server) | API routes needed for proxy — no `output: 'export'` |
| Editor | CodeMirror 6 | `@codemirror/lang-markdown` + `basicSetup` |
| MD rendering | `unified` + `remark` + `rehype` | Composable pipeline; mermaid post-processed separately |
| Mermaid | `mermaid.js` | Lazy-loaded, initialised once in `layout.tsx` |
| Search | `flexsearch` in a Web Worker | Non-blocking, ~7 KB |
| State | Zustand | `store/appStore.ts` |
| File storage | OPFS (Origin Private File System) | Real file tree, persists across sessions |
| Metadata / cache | IndexedDB | Tags, search index, AI response cache, file meta |
| UI prefs | `localStorage` | Panel widths, last open file, theme |
| AI proxy | Next.js `/api/ai` route | Streams Claude SSE; `ANTHROPIC_API_KEY` server-side only |
| Transcription proxy | Next.js `/api/transcribe` route | Forwards audio to Whisper; `OPENAI_API_KEY` server-side only |
| Export | Print CSS (PDF) · `docx` npm (DOCX) · inline HTML | No server-side renderer needed for v1 |
| Deployment | Vercel (recommended) or Cloud Run (Docker) | `vercel.json` sets `maxDuration: 60` on AI route |

## Design system

Style: **Centered Device Cascade — Minimal Ink**

| Token | Value |
|---|---|
| `surface.primary` | `#FFFFFF` |
| `foreground.primary` | `#1A1A1A` |
| `foreground.secondary` | `#666666` |
| `foreground.muted` | `#999999` |
| `accent.primary` | `#0066FF` |
| `accent.light` | `#EBF0FF` |
| `border` | `#E5E5E5` |
| `surface.secondary` | `#F5F5F5` |
| `surface.tertiary` | `#FAFAFA` |
| Heading font | **Inter** |
| Body font | **Geist** |
| Caption font | **Funnel Sans** |
| Mono font | **Geist Mono** |
| Border radius (UI) | `4px` chips/buttons · `6px` inputs · `8px` cards · `12px` modals |
| Shadow (modals) | `0 2px 4px #00000008, 0 12px 32px #0000000f` (Soft Cloud) |
| Shadow (panels) | `0 1px 4px #00000008` |

Wireframes are in Pencil (`pencil-new.pen`), three screens:
- **01 — Main App** — 3-panel layout (sidebar / editor+preview / AI panel)
- **02 — Search Modal** — ⌘K full-text search across all files
- **03 — Export & Audio** — format picker + audio drop zone

---

## Project structure

```
folio/
├── app/
│   ├── api/
│   │   ├── ai/route.ts              # Claude SSE proxy
│   │   └── transcribe/route.ts      # Whisper audio proxy
│   ├── layout.tsx                   # Mermaid init, font imports (Inter/Geist/Funnel Sans)
│   └── page.tsx                     # Single-page shell → <AppShell />
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx             # CSS Grid 3-panel manager
│   │   ├── Sidebar.tsx              # File tree + footer
│   │   └── PanelResizer.tsx         # Drag handle, persists to localStorage
│   ├── filetree/
│   │   ├── FileTree.tsx             # Recursive FSNode renderer
│   │   ├── FileTreeItem.tsx         # Single row: icon + label + context menu
│   │   └── NewItemInput.tsx         # Inline create/rename input
│   ├── editor/
│   │   ├── Editor.tsx               # CodeMirror 6 instance wrapper
│   │   ├── Preview.tsx              # unified HTML output + mermaid post-process
│   │   └── EditorToolbar.tsx        # Format buttons, view toggle, meta row
│   ├── ai/
│   │   ├── AIPanel.tsx              # Right panel container
│   │   ├── AIStream.tsx             # Streaming markdown renderer
│   │   ├── QuickActions.tsx         # Preset prompt chips
│   │   ├── ScopeSelector.tsx        # File / Folder / All toggle
│   │   └── AudioUpload.tsx          # Drag-and-drop + XHR progress
│   ├── search/
│   │   └── SearchModal.tsx          # ⌘K modal, filter tabs, result rows
│   ├── export/
│   │   └── ExportModal.tsx          # Format picker + audio tab
│   └── ui/                          # Button, Input, Modal, Badge, ContextMenu…
├── hooks/
│   ├── useOPFS.ts                   # Mount root, read/write/delete/rename
│   ├── useFileTree.ts               # Tree state from OPFS, CRUD helpers
│   ├── useEditor.ts                 # CM instance, autosave debounce, dirty flag
│   ├── useAI.ts                     # streamAI generator, chat history, abort
│   ├── useSearch.ts                 # Worker bridge: index / search / update
│   └── useExport.ts                 # exportHTML / exportPDF / exportDOCX
├── lib/
│   ├── opfs.ts                      # readFile / writeFile / deleteFile / listTree / renameEntry
│   ├── indexeddb.ts                 # file-meta · tags · ai-cache stores
│   ├── markdown.ts                  # unified processor + renderMermaidBlocks()
│   ├── ai.ts                        # streamAI() async generator
│   ├── prompts.ts                   # SYSTEM_BASE + PROMPTS map
│   └── search-worker.ts             # Flexsearch Document, runs in Worker
├── store/
│   └── appStore.ts                  # Zustand: activeFileId, content, panel layout, editorMode
├── types/
│   └── index.ts                     # FSNode, AIMessage, AIScope, ExportFormat, FileMeta
├── public/
│   └── favicon.svg                  # Folio logo mark
├── vercel.json                      # maxDuration: 60 (ai), 120 (transcribe)
└── .env.local                       # ANTHROPIC_API_KEY · OPENAI_API_KEY
```

---

## Phase 1 — Project skeleton + editor shell

**Goal:** Working 3-panel layout (Inter/Geist/Funnel Sans loaded), CodeMirror editor, live MD preview split. No persistence. Files exist in memory only.

**Effort:** 2–3 days

### 1.1 Initialise project

```bash
npx create-next-app@latest folio \
  --typescript --tailwind --eslint --app --src-dir=false
cd folio
npm install zustand \
  @codemirror/view @codemirror/state @codemirror/lang-markdown \
  unified remark-parse remark-gfm remark-rehype \
  rehype-highlight rehype-stringify rehype-raw \
  gray-matter mermaid
```

### 1.2 Fonts + global CSS

`app/layout.tsx` — import Inter, Geist, Funnel Sans from Google Fonts. Apply Minimal Ink tokens as CSS variables on `:root`. Initialise Mermaid once:

```typescript
import mermaid from 'mermaid'
mermaid.initialize({ startOnLoad: false, theme: 'neutral' })
```

### 1.3 Zustand store

`store/appStore.ts` — state shape:

```typescript
{
  tree: FSNode[]
  activeFileId: string | null
  content: string
  sidebarWidth: number        // default 220, persisted to localStorage
  aiPanelOpen: boolean        // default true
  aiPanelWidth: number        // default 300, persisted to localStorage
  editorMode: 'split' | 'source' | 'preview'
}
```

### 1.4 AppShell layout

`components/layout/AppShell.tsx` — CSS Grid:

```
grid-template-columns: {sidebarWidth}px 1px 1fr 1px {aiPanelWidth}px
```

- `1px` columns = drag handle zones (`PanelResizer`)
- Sidebar: min 160px, max 400px
- AI panel: collapsible to 0 via `toggleAIPanel()`
- Mobile (<768px): single column, bottom tab bar (Files · Edit · Preview · AI)

### 1.5 CodeMirror editor

`components/editor/Editor.tsx` — mount once on `useEffect([], [])`, sync external content changes via `view.dispatch()`. Extensions: `basicSetup`, `markdown()`, `updateListener` → `onChange`.

### 1.6 Markdown preview + Mermaid

`components/editor/Preview.tsx` — run unified pipeline then `renderMermaidBlocks()`:

```typescript
async function renderMermaidBlocks(html: string): Promise<string> {
  // Find <code class="language-mermaid">, render each to SVG via mermaid.render()
  // Replace the <pre><code> with a <div class="mermaid-diagram"> wrapper
}
```

### 1.7 Editor toolbar

`components/editor/EditorToolbar.tsx` — format buttons (B I H1 H2 — <> ⬡), view mode toggle (Edit / Split / Preview), meta row (word count · reading time · save status).

**Deliverable:** `npm run dev` → 3-panel layout with live MD preview and Mermaid diagrams rendering. No file save yet.

---

## Phase 2 — OPFS persistence + file tree

**Goal:** Files persist across sessions. File tree mirrors real OPFS structure. Create, rename, delete, open files. Autosave on edit.

**Effort:** 2–3 days

### 2.1 OPFS primitives (`lib/opfs.ts`)

```typescript
readFile(path)        // → string
writeFile(path, content)
deleteFile(path)
createFolder(path)
deleteFolder(path)    // recursive
renameEntry(oldPath, newName)  // copy+delete (OPFS has no rename)
listTree(dir?, prefix?)        // → FSNode[] sorted: folders first, alpha
```

Cache the root handle: `navigator.storage.getDirectory()` called once.

### 2.2 File tree hook (`hooks/useFileTree.ts`)

- `refresh()` → calls `listTree()`, updates Zustand `tree`
- `createFile(path)` → `writeFile` default content → `refresh()` → return path
- `createFolder(path)` → `opfsCreateFolder` → `refresh()`
- `deleteNode(node)` → file or recursive folder delete → `refresh()`
- `renameNode(node, newName)` → `renameEntry` → `refresh()` → return new path

### 2.3 File tree UI (`components/filetree/`)

`FileTree.tsx` — recursive render of `FSNode[]`.  
`FileTreeItem.tsx`:
- Left-click → `setActiveFile(node.id)`, load content from OPFS into editor
- Right-click → context menu: Rename · Delete · New file here · New folder here
- Folder click → expand/collapse (local state)
- Active file: `#EBF0FF` background + `#0066FF` 3px left bar + bold Inter label

`NewItemInput.tsx` — inline input that commits on Enter, cancels on Escape.

### 2.4 Autosave (`hooks/useEditor.ts`)

Debounce 800ms after last keystroke:

```typescript
clearTimeout(saveTimer)
saveTimer = setTimeout(async () => {
  await writeFile(activeFileId, newContent)
  setSavedContent(newContent)
}, 800)
```

Dirty flag (`content !== savedContent`) → show `●` dot on file tree row and `Saving…` in toolbar; clear to `● Saved` (Funnel Sans, `#16A34A`) on write.

### 2.5 Storage quota check

On startup and after each write:

```typescript
const { usage, quota } = await navigator.storage.estimate()
if ((usage / quota) > 0.8) showWarning('Storage 80%+ full…')
```

**Deliverable:** Files and folders persist across refresh. File tree reflects OPFS. Autosave status visible in toolbar.

---

## Phase 3 — AI proxy + streaming summary

**Goal:** AI panel with streaming summaries, quick-action presets, and file/folder/all-scoped chat.

**Effort:** 2 days

### 3.1 Claude proxy (`app/api/ai/route.ts`)

```typescript
// Rate limit: 10 req/min per IP (in-memory Map, resets each minute)
// Payload guard: reject if estimated tokens > 150k (JSON.length / 4 > 600k chars)
// Forward to https://api.anthropic.com/v1/messages with stream: true
// Pipe SSE body straight through — no buffering
// Headers: content-type: text/event-stream, x-accel-buffering: no
```

`ANTHROPIC_API_KEY` read from `process.env` — never sent to the browser.

### 3.2 Whisper proxy (`app/api/transcribe/route.ts`)

```typescript
// Accept multipart/form-data with `file` field
// Validate MIME: audio/mpeg | audio/wav | audio/mp4 | audio/m4a | audio/webm | audio/ogg
// Validate size < 25MB
// Forward to https://api.openai.com/v1/audio/transcriptions (model: whisper-1)
// Return { text: string }
```

### 3.3 Stream consumer (`lib/ai.ts`)

```typescript
export async function* streamAI(
  messages: AIMessage[],
  system: string,
  signal?: AbortSignal,
): AsyncGenerator<string>
// fetch('/api/ai') → ReadableStream → SSE chunk parse → yield delta.text
// Handle buffer splits across chunk boundaries
// Skip malformed JSON chunks silently
```

### 3.4 AI hook (`hooks/useAI.ts`)

State: `output`, `loading`, `error`, `history`.  
`run(userMessage, systemPrompt, contextContent)`:
- Abort any in-flight request
- Build messages array with `<document>` wrapper around context
- Stream tokens into `output` via `for await`
- Append to `history` on completion

`stop()` → `abortController.abort()`  
`clearHistory()` → reset chat

### 3.5 Scope context builder

```typescript
// 'file'   → readFile(activeFileId)
// 'folder' → read all .md files in active folder, join with \n\n---\n\n headers
// 'all'    → read every .md in OPFS
// Warn user if estimated context > 100k tokens before sending
```

### 3.6 AI panel (`components/ai/AIPanel.tsx`)

Top to bottom:
1. **Header** — "AI Assistant" (Inter 600) + `ScopeSelector` (File / Folder / All pills, `#0066FF` active)
2. **Quick actions** — `QuickActions.tsx`: chip row of `Action items · Decisions · Questions · Timeline · Summary · Next steps`, Funnel Sans 11px, `#F5F5F5` bg, `4px` radius
3. **Prompt input** — optional free-text, Geist 12px, `#F5F5F5` bg
4. **Summarize button** — Inter 600, `#0066FF`, `4px` radius, `⚡ Summarize`
5. **Response area** — `AIStream.tsx` renders streaming markdown via Preview pipeline (re-process on each token batch); stream badge (green dot + Funnel Sans label showing scope + file count)
6. **Chat input** — Geist placeholder, send button `#0066FF`, Funnel Sans hint row

### 3.7 Prompt templates (`lib/prompts.ts`)

```typescript
export const PROMPTS = {
  'Action items':  '…Extract all action items as a checklist with owner and due date…',
  'Decisions':     '…List all decisions made: what, who, rationale…',
  'Questions':     '…List all unresolved questions and blockers…',
  'Timeline':      '…Extract all dates and deadlines as a chronological list…',
  'Summary':       '…3–5 bullet summary: main topic, outcomes, follow-ups…',
  'Next steps':    '…List implied next steps ordered by priority…',
}
```

Model: `claude-sonnet-4-6`, `max_tokens: 4096`.

**Deliverable:** Drop a transcript → click "Action items" → streamed checklist appears within 2–3s of first token.

---

## Phase 4 — Full-text search + metadata + AI cache

**Goal:** ⌘K search across all files. Tag system from frontmatter. File metadata in toolbar. AI response cache to avoid re-calling the API for identical content+prompt.

**Effort:** 2–3 days

### 4.1 IndexedDB schema (`lib/indexeddb.ts`)

```
Database: folio-meta  (version 1)

file-meta     keyPath: path
              fields: path, wordCount, readingTimeSeconds, lastModified, tags[]

ai-cache      keyPath: cacheKey   (SHA-256 of path+content+prompt)
              fields: cacheKey, response, createdAt
              TTL: evict entries > 7 days on startup
```

No separate tag store needed — tags are derived from `file-meta` on demand.

### 4.2 Flexsearch Web Worker (`lib/search-worker.ts`)

```typescript
// Worker receives messages: { type: 'index' | 'search' | 'update' | 'remove', payload }
// index: bulk-add { path, name, content }[] on startup
// search: return top-20 results with path, name, matched excerpt
// update: re-index a single file after save
// remove: remove a file from index on delete
```

`hooks/useSearch.ts` — bridge hook: creates worker once, sends messages, receives results via `onmessage`.

### 4.3 Search modal (`components/search/SearchModal.tsx`)

Triggered by ⌘K / Ctrl+K. Design matches wireframe 02:
- Search bar: Inter 500 15px, `⌕` icon, `esc` badge (Funnel Sans, `#F5F5F5` bg)
- Filter tabs: All / Meetings / Projects / Notes — Funnel Sans 11px, `#EBF0FF` + `#0066FF` active
- Result rows: file name (Inter 600, `#1A1A1A`) · folder (Funnel Sans, `#999999`) · match excerpt (Geist 12px, `#666666`)
- Active result: `#EBF0FF` bg, file name in `#0066FF`
- Footer: keyboard shortcuts (Geist Mono keys, Funnel Sans labels)

### 4.4 Frontmatter tag system

Parse with `gray-matter` on file load. Strip frontmatter from rendered preview. Display tags as `#EBF0FF` / `#0066FF` Funnel Sans pills in editor toolbar. Autocomplete pulls from all known tags in `file-meta`.

### 4.5 File metadata

Compute on save, store in `file-meta`:

```typescript
{ wordCount, readingTimeSeconds: Math.ceil(words / 4), lastModified: Date.now() }
```

Display in toolbar: `1,240 words · 5 min read` (Funnel Sans, `#999999`).

### 4.6 AI response cache

Before `/api/ai` call:

```typescript
const key = await sha256(`${path}:${content}:${prompt}`)
const cached = await idb.get('ai-cache', key)
if (cached) replayAsStream(cached.response)  // chunk into 20-char pieces at 20ms intervals
else { /* call API, store result */ }
```

**Deliverable:** ⌘K opens search modal with live results. Tags shown in toolbar. AI responses instant on repeat for same file+prompt.

---

## Phase 5 — Audio upload + transcription pipeline

**Goal:** Drop an audio file → Whisper transcribes → transcript lands as `.md` in current folder → AI auto-extracts action items.

**Effort:** 1–2 days

### 5.1 AudioUpload component (`components/ai/AudioUpload.tsx`)

- Drag-and-drop zone in sidebar footer (or via "Upload audio" tab in Export modal)
- Accept: `audio/mpeg audio/wav audio/mp4 audio/m4a audio/webm audio/ogg`
- Size guard: 25MB client-side before sending
- Use `XMLHttpRequest` (not `fetch`) for `upload.onprogress` → progress bar
- Status states: `idle → uploading → transcribing → done`

### 5.2 Transcript formatter

On Whisper response, create `.md` file in current folder:

```
---
tags: [transcript, meeting]
date: 2024-06-17
source: recording.m4a
---

# recording

> Transcribed 17/06/2024 14:32

{transcript text}
```

Auto-open the new file in the editor. Auto-trigger "Action items" quick action in AI panel.

### 5.3 Text file import

Drag `.txt` or `.md` onto the sidebar → prompt modal: "Save as markdown?" with editable filename + folder selector → write to OPFS → open.

**Deliverable:** Drop `.m4a` → 10–30s → transcript open in editor with action items streaming in AI panel.

---

## Phase 6 — Export

**Goal:** Export current file to PDF, HTML, and DOCX from the Export modal (wireframe 03).

**Effort:** 1–2 days

### 6.1 Export modal (`components/export/ExportModal.tsx`)

Two tabs:
- **Export file** — radio cards: PDF (default selected, `#EBF0FF` bg + `#0066FF` border) · HTML · DOCX · Confluence
- **Upload audio** — reuses `AudioUpload` component

Footer: Cancel + "Export PDF" button (Inter 600, `#0066FF`, `6px` radius).

### 6.2 HTML export

Take unified-rendered HTML, wrap in self-contained `<!DOCTYPE html>` with embedded Geist font import and Tailwind prose CSS inlined. Trigger `downloadBlob`.

### 6.3 PDF export

Open rendered HTML in a new window. Inject print CSS that hides app chrome. Call `window.print()`. Browser "Save as PDF" handles pagination.

Stretch (v1.1): `jsPDF` + `html2canvas` for fully programmatic PDF — acceptable limitation that text won't be selectable.

### 6.4 DOCX export

```bash
npm install docx
```

Walk the `mdast` (stop before rehype). Map:
- `heading` → `HeadingLevel.HEADING_1/2/3`
- `paragraph` → `Paragraph` with `TextRun` (bold/italic/code inline)
- `list` → `BulletList` / `NumberedList`
- `code` block → `Paragraph` with Geist Mono `TextRun`
- `table` → `Table` with `TableRow` / `TableCell`
- Mermaid blocks → placeholder paragraph `[Mermaid diagram — view in browser]`

**Deliverable:** Export modal with all three formats working. HTML and PDF work fully; DOCX works for text-heavy documents.

---

## Phase 7 — Polish + reliability

**Goal:** Production-ready: error recovery, keyboard shortcuts, vault backup, mobile layout.

**Effort:** 2 days

### 7.1 Error boundaries

Wrap Editor, Preview, AIPanel each in `React.ErrorBoundary`. OPFS errors → inline `#FEF2F2` banner. Never crash the whole app.

### 7.2 Vault zip backup

```bash
npm install jszip
```

Settings menu → "Export vault" → JSZip packs full OPFS tree → download `folio-backup-{timestamp}.zip`.

### 7.3 Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open search |
| `⌘/` | Toggle AI panel |
| `⌘E` | Cycle editor mode (split → source → preview) |
| `⌘S` / `Ctrl+S` | Force save |
| `⌘Shift+P` | Export PDF |
| `⌘N` | New file in current folder |
| `⌘Shift+N` | New folder |
| `F2` | Rename focused file |
| `Delete` | Delete focused file (confirm dialog) |
| `Escape` | Close modal / cancel AI stream |

Register via `useEffect` on `document.addEventListener('keydown')`. Respect `event.target` — don't fire when typing in an input.

### 7.4 Mobile layout (< 768px)

- Collapse to single-panel view
- Bottom tab bar: Files · Edit · Preview · AI (Funnel Sans 11px)
- Sidebar → full-screen drawer with close button
- AI panel → bottom sheet with drag handle (height: 60vh default)

### 7.5 Loading states

- File tree: skeleton rows while OPFS loads
- Search: debounce 150ms before sending to worker; spinner on results area
- AI stream: typing indicator (3-dot pulse) before first token arrives
- Audio upload: progress bar (XHR `upload.onprogress`)

---

## Proxy architecture

```
Browser SPA                  Next.js proxy              External APIs
─────────────────            ─────────────────          ──────────────────
AI panel          ──POST──▶  /api/ai                    Claude API
  fetch + stream  ◀──SSE──   rate limit + pipe stream   claude-sonnet-4-6
                             ANTHROPIC_API_KEY (env)

AudioUpload       ──POST──▶  /api/transcribe             Whisper API
  XHR + progress  ◀──JSON──  size + MIME validate        whisper-1
                             OPENAI_API_KEY (env)

Search / Export              (all client-side)
  OPFS + Flexsearch
  jsPDF / docx
```

Keys never reach the browser. Rate limit: 10 req/min per IP (in-memory, resets per minute).

---

## Environment variables

`.env.local` — never committed:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

---

## Deployment

### Vercel (recommended for v1)

`vercel.json`:

```json
{
  "functions": {
    "app/api/ai/route.ts": { "maxDuration": 60 },
    "app/api/transcribe/route.ts": { "maxDuration": 120 }
  }
}
```

Add env vars in Vercel dashboard → Settings → Environment Variables.

### Cloud Run (existing infra)

`next.config.ts`: `output: 'standalone'`

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

Inject `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` via Cloud Run Secret Manager.

---

## Delivery summary

| Phase | Feature | Key files | Est. effort |
|---|---|---|---|
| 1 | Layout + editor + preview + fonts | `AppShell`, `Editor`, `Preview`, `appStore`, `layout.tsx` | 2–3 days |
| 2 | OPFS persistence + file tree + autosave | `lib/opfs.ts`, `useFileTree`, `FileTree`, `useEditor` | 2–3 days |
| 3 | AI proxy + streaming + quick actions | `/api/ai`, `lib/ai.ts`, `useAI`, `AIPanel`, `lib/prompts.ts` | 2 days |
| 4 | Search + metadata + tags + AI cache | `search-worker`, `useSearch`, `SearchModal`, `lib/indexeddb.ts` | 2–3 days |
| 5 | Audio upload + Whisper transcription | `/api/transcribe`, `AudioUpload`, transcript formatter | 1–2 days |
| 6 | Export (HTML / PDF / DOCX) | `ExportModal`, `useExport`, `docx` AST mapper | 1–2 days |
| 7 | Polish, shortcuts, mobile, vault backup | Error boundaries, keyboard map, mobile CSS, JSZip | 2 days |

**Total: ~12–18 days solo.** Each phase ships a working, usable product. Phase 3 alone covers 80% of the meeting-transcript use case.
