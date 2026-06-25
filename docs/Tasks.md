# Folio — Task List

> Track progress phase by phase. Each task has a unique ID in the format
> `P<phase>.<section>.<index>` (e.g. `P2.4.3`). Deployment tasks use `PD.V.1` / `PD.CR.1`.
> **Stack:** Next.js · CodeMirror 6 · OPFS · IndexedDB · Zustand · Claude API · Whisper API  
> **Design:** Minimal Ink — Inter / Geist / Funnel Sans / Geist Mono

---

## Phase 1 — Project skeleton + editor shell
> Goal: 3-panel layout with live MD preview and Mermaid. No persistence yet.

### 1.1 — Setup
- [x] `P1.1.1` Run `create-next-app` with TypeScript, Tailwind, ESLint, App Router, no `src/` dir
- [x] `P1.1.2` Install core deps: `zustand`, `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-highlight`, `rehype-stringify`, `rehype-raw`, `gray-matter`, `mermaid`
- [x] `P1.1.3` Create `types/index.ts` — export `FSNode`, `AIMessage`, `AIScope`, `ExportFormat`, `FileMeta`
- [x] `P1.1.4` Create `.env.local` with `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` placeholders
- [x] `P1.1.5` Create `vercel.json` — set `maxDuration: 60` for `/api/ai`, `120` for `/api/transcribe`
- [x] `P1.1.6` Add `.env.local` to `.gitignore`

### 1.2 — Fonts + design tokens
- [x] `P1.2.1` In `app/layout.tsx`: import Inter, Geist, Funnel Sans from Google Fonts (`next/font/google`)
- [x] `P1.2.2` Add Minimal Ink CSS variables to `:root` in `app/globals.css`:
  - `--color-surface-primary: #FFFFFF`
  - `--color-surface-secondary: #F5F5F5`
  - `--color-surface-tertiary: #FAFAFA`
  - `--color-fg-primary: #1A1A1A`
  - `--color-fg-secondary: #666666`
  - `--color-fg-muted: #999999`
  - `--color-accent: #0066FF`
  - `--color-accent-light: #EBF0FF`
  - `--color-border: #E5E5E5`
  - `--color-success: #16A34A`
- [x] `P1.2.3` Add Tailwind config aliases that reference these CSS vars
- [x] `P1.2.4` Initialise Mermaid once in `app/layout.tsx`: `mermaid.initialize({ startOnLoad: false, theme: 'neutral' })`

### 1.3 — Zustand store (`store/appStore.ts`)
- [x] `P1.3.1` Define `AppState` type with: `tree`, `activeFileId`, `content`, `sidebarWidth`, `aiPanelOpen`, `aiPanelWidth`, `editorMode`
- [x] `P1.3.2` Implement store with `create<AppState>()` and all setters/togglers
- [x] `P1.3.3` On store init, read `sidebarWidth` and `aiPanelWidth` from `localStorage` (default 220 / 300)
- [x] `P1.3.4` Persist `sidebarWidth` and `aiPanelWidth` to `localStorage` whenever they change

### 1.4 — AppShell layout (`components/layout/AppShell.tsx`)
- [x] `P1.4.1` Implement CSS Grid: `grid-template-columns: {sidebarWidth}px 1px 1fr 1px {aiPanelWidth}px`
- [x] `P1.4.2` Wire sidebar width and AI panel width from Zustand store
- [x] `P1.4.3` Collapse AI panel to `0px` width when `aiPanelOpen === false`
- [x] `P1.4.4` Create `PanelResizer.tsx` — draggable `1px` divider, updates store width on `mouseup`
- [x] `P1.4.5` Create `Sidebar.tsx` — placeholder `<div>` for now, full height, `#FAFAFA` bg
- [x] `P1.4.6` Add mobile breakpoint (<768px): single-column layout, bottom tab bar with 4 tabs (Files · Edit · Preview · AI)

### 1.5 — CodeMirror editor (`components/editor/Editor.tsx`)
- [x] `P1.5.1` Mount `EditorView` once in `useEffect([], [])` with `basicSetup`, `markdown()`, `updateListener`
- [x] `P1.5.2` Call `onChange(value)` from `updateListener` only when `update.docChanged`
- [x] `P1.5.3` Sync external `content` prop changes via `view.dispatch()` without re-mounting
- [x] `P1.5.4` Apply `height: 100%` and `overflow: auto` on `.cm-scroller` via `EditorView.theme()`
- [x] `P1.5.5` Destroy view on component unmount

### 1.6 — Markdown preview (`components/editor/Preview.tsx`)
- [x] `P1.6.1` Create singleton `unified` processor: `remarkParse → remarkGfm → remarkRehype → rehypeRaw → rehypeHighlight → rehypeStringify`
- [x] `P1.6.2` Run processor in `useEffect` whenever `content` changes, set resulting HTML into state
- [x] `P1.6.3` Implement `renderMermaidBlocks(html)`: find all `<code class="language-mermaid">`, call `mermaid.render()` per block, replace `<pre><code>` with `<div class="mermaid-diagram">`
- [x] `P1.6.4` Chain `renderMermaidBlocks` after unified processing before setting state
- [x] `P1.6.5` Apply Tailwind `prose` class for typography; strip frontmatter from content before passing to processor (use `gray-matter`)

### 1.7 — Editor toolbar (`components/editor/EditorToolbar.tsx`)
- [x] `P1.7.1` Render format buttons: B · I · H1 · H2 · — · `<>` · ⬡ (Inter 11px bold, `#666666`)
- [x] `P1.7.2` Render view mode toggle: Edit / Split / Preview — active state `#EBF0FF` bg + Inter 600 `#0066FF`
- [x] `P1.7.3` Render meta row (right-aligned): word count · reading time · save status (Funnel Sans 11px, `#999999`)
- [x] `P1.7.4` Wire view mode toggle to `setEditorMode()` in Zustand
- [x] `P1.7.5` Show "Saving…" (grey) / "● Saved" (green `#16A34A`) based on dirty flag from `useEditor`

### 1.8 — Split pane wiring (`app/page.tsx`)
- [x] `P1.8.1` Render `<AppShell>` as the single root element
- [x] `P1.8.2` In editor zone: show `<Editor>` + `<Preview>` side-by-side when `editorMode === 'split'`
- [x] `P1.8.3` Show only `<Editor>` when `editorMode === 'source'`
- [x] `P1.8.4` Show only `<Preview>` when `editorMode === 'preview'`
- [x] `P1.8.5` Wire `content` and `onChange` between editor, preview, and Zustand store

**✓ Phase 1 done when:** `npm run dev` shows the 3-panel layout, typing markdown renders live with Mermaid diagrams, view mode toggle works.

---

## Phase 2 — OPFS persistence + file tree
> Goal: Files survive page refresh. File tree mirrors OPFS. Autosave on every edit.

### 2.1 — OPFS primitives (`lib/opfs.ts`)
- [x] `P2.1.1` Cache root handle: call `navigator.storage.getDirectory()` once, store in module-level variable
- [x] `P2.1.2` Implement `readFile(path: string): Promise<string>` — resolve path parts, `getFile()`, `.text()`
- [x] `P2.1.3` Implement `writeFile(path: string, content: string): Promise<void>` — resolve dirs with `{ create: true }`, `createWritable()`, write, close
- [x] `P2.1.4` Implement `deleteFile(path: string): Promise<void>`
- [x] `P2.1.5` Implement `createFolder(path: string): Promise<void>` — resolve all path parts with `{ create: true }`
- [x] `P2.1.6` Implement `deleteFolder(path: string): Promise<void>` — `removeEntry(name, { recursive: true })`
- [x] `P2.1.7` Implement `renameEntry(oldPath: string, newName: string): Promise<string>` — copy content to new path, delete old path, return new path
- [x] `P2.1.8` Implement `listTree(dir?, prefix?): Promise<FSNode[]>` — recurse via `dir.entries()`, sort folders first then alpha
- [x] `P2.1.9` Export all functions from `lib/opfs.ts`

### 2.2 — File tree hook (`hooks/useFileTree.ts`)
- [x] `P2.2.1` `refresh()` — call `listTree()`, write result to Zustand `tree`, set `loading: false`
- [x] `P2.2.2` Call `refresh()` once on mount (triggers initial OPFS scan)
- [x] `P2.2.3` `createFile(path)` — `writeFile(path, defaultContent)` → `refresh()` → return path
- [x] `P2.2.4` `createFolder(path)` — `opfsCreateFolder(path)` → `refresh()`
- [x] `P2.2.5` `deleteNode(node)` — branch on `node.type`, call file or folder delete → `refresh()`
- [x] `P2.2.6` `renameNode(node, newName)` — `renameEntry()` → `refresh()` → return new path
- [x] `P2.2.7` Return `{ tree, loading, refresh, createFile, createFolder, deleteNode, renameNode }`

### 2.3 — FileTree component (`components/filetree/FileTree.tsx`)
- [x] `P2.3.1` Render list of `FSNode[]` recursively — folders rendered before files at each level
- [x] `P2.3.2` Pass `depth` prop down for left-padding calculation (`depth * 14px`)
- [x] `P2.3.3` Show folder expand/collapse chevron; toggle on click (local component state)
- [x] `P2.3.4` Render `FileTreeItem` for each node

### 2.4 — FileTreeItem component (`components/filetree/FileTreeItem.tsx`)
- [x] `P2.4.1` Left-click → call `setActiveFile(node.id)`, read file content from OPFS, call `setContent()`
- [x] `P2.4.2` Active file: `#EBF0FF` background, 3px `#0066FF` left bar, Inter 600 label
- [x] `P2.4.3` Non-active file: Geist 12px `#666666` label
- [x] `P2.4.4` Folder: Inter 500 12px `#1A1A1A` label
- [x] `P2.4.5` Right-click → show context menu: Rename · Delete · New file here · New folder here
- [x] `P2.4.6` Show `●` dot (Funnel Sans, `#0066FF`) on rows with unsaved changes (dirty flag)
- [x] `P2.4.7` `ContextMenu` — positioned absolutely, closes on outside click or Escape

### 2.5 — NewItemInput component (`components/filetree/NewItemInput.tsx`)
- [x] `P2.5.1` Render inline text `<input>` in place of the file/folder row
- [x] `P2.5.2` Commit on `Enter` → call `createFile` or `createFolder`, open new file
- [x] `P2.5.3` Cancel on `Escape` → remove input without creating anything
- [x] `P2.5.4` Auto-focus input on mount

### 2.6 — Autosave (`hooks/useEditor.ts`)
- [x] `P2.6.1` Load file content from OPFS when `activeFileId` changes; set both `content` and `savedContent`
- [x] `P2.6.2` On `handleChange(newContent)`: update `content` in Zustand, start 800ms debounce timer
- [x] `P2.6.3` On debounce fire: `writeFile(activeFileId, newContent)` → update `savedContent` → clear `saving` flag
- [x] `P2.6.4` Expose `isDirty` = `content !== savedContent` and `saving` boolean
- [x] `P2.6.5` Cancel pending timer on unmount or when `activeFileId` changes

### 2.7 — Storage quota check
- [x] `P2.7.1` Call `navigator.storage.estimate()` on app startup and after each `writeFile`
- [x] `P2.7.2` If `usage / quota > 0.8`, show warning banner: "Storage 80%+ full. Export vault to free space."
- [x] `P2.7.3` Warning banner: `#FEF2F2` bg, Geist 13px, dismissable

### 2.8 — Sidebar wiring (`components/layout/Sidebar.tsx`)
- [x] `P2.8.1` Render `<FileTree>` in top section, full height with `overflow-y: auto`
- [x] `P2.8.2` Render footer section: "Upload audio / transcript" button (Funnel Sans 12px, `#666666`, border `#E5E5E5`)
- [x] `P2.8.3` Render sidebar header: "FILES" label (Funnel Sans 10px 600 `#999999`) + `+` new file button
- [x] `P2.8.4` Apply box shadow: `0 1px 4px #00000008` on sidebar right edge separator

**✓ Phase 2 done when:** Create a file, type content, refresh the page — file tree and content are exactly as left.

---

## Phase 3 — AI provider layer + streaming summary
> Goal: Provider-agnostic AI — **Proxy / BYOK / Local** modes across **OpenAI + Anthropic** dialects —
> plus a Settings modal, streaming summaries, presets, scoped context, and chat.
> **Design:** see `docs/ai-provider-design.md` (two-axis `mode` × `dialect` model).

### 3.1 — Provider types + settings store (`types/index.ts`, `store/settingsStore.ts`)
- [x] `P3.1.1` Add types: `ProviderMode` (`proxy`|`byok`|`local`), `ApiDialect` (`anthropic`|`openai`), `ProviderConfig`, `AISettings`
- [x] `P3.1.2` Create `store/settingsStore.ts` — Zustand store: `activeProviderId`, `providers`, `keys`
- [x] `P3.1.3` Persist non-secrets to `localStorage` key `folio.ai.settings`; persist `keys` separately to `folio.ai.keys` (SSR-safe, like `appStore`)
- [x] `P3.1.4` Seed `DEFAULT_PROVIDERS`: `proxy` (Folio Cloud), `byok-anthropic`, `byok-openai`, `local-ollama`; default `activeProviderId = "proxy"`
- [x] `P3.1.5` Implement `setActiveProvider`, `upsertProvider`, `removeProvider`, `setKey`, `clearKey`, `getActive`
- [x] `P3.1.6` Custom `local` providers get a uuid id (LM Studio, etc.)
- [x] `P3.1.7` Unit tests: round-trip through localStorage; secrets/configs under separate keys; `getActive` resolves

### 3.2 — Claude proxy (`app/api/ai/route.ts`) — used by `proxy` mode only
- [x] `P3.2.1` Export `POST` handler as a Next.js Route Handler
- [x] `P3.2.2` Rate limiter via a **durable store** (Upstash/Vercel KV — not an in-memory `Map`, which resets per serverless invocation), 10 req/min, `429` when exceeded
- [x] `P3.2.3` Validate payload: estimate tokens as `JSON.stringify(body.messages).length / 4`; return `413` if > 150 000
- [x] `P3.2.4` Read `ANTHROPIC_API_KEY` from `process.env` — never expose it in response or logs
- [x] `P3.2.5` Forward request to `https://api.anthropic.com/v1/messages` with `stream: true`, model `claude-sonnet-4-6`, `max_tokens: 4096`
- [x] `P3.2.6` Pipe `upstream.body` straight to response — no buffering
- [x] `P3.2.7` Set headers: `content-type: text/event-stream`, `cache-control: no-cache`, `x-accel-buffering: no`
- [x] `P3.2.8` Return `{ status: upstream.status }` error passthrough if upstream is not ok
- [x] `P3.2.9` Add a hard monthly spend cap + minimal auth in front of the route (see review notes)

### 3.3 — Whisper proxy (`app/api/transcribe/route.ts`)
- [x] `P3.3.1` Export `POST` handler
- [x] `P3.3.2` Parse `multipart/form-data`, extract `file` field
- [x] `P3.3.3` Validate MIME type — allow: `audio/mpeg`, `audio/wav`, `audio/mp4`, `audio/m4a`, `audio/webm`, `audio/ogg`; return `415` otherwise
- [x] `P3.3.4` Validate file size < 25MB; return `413` otherwise
- [x] `P3.3.5` Forward `FormData` to `https://api.openai.com/v1/audio/transcriptions` with `model: whisper-1`
- [x] `P3.3.6` Return `{ text: string }` from Whisper response

### 3.4 — Dual-dialect stream consumer (`lib/ai.ts`)
- [x] `P3.4.1` `streamAI(messages, system, provider, apiKey?, signal?)` as an `async function*` generator
- [x] `P3.4.2` `buildRequest(provider, apiKey, messages, system)` → `{ url, headers, body }`, branch on `mode` then `dialect`
- [x] `P3.4.3` `proxy` mode → POST `/api/ai` with `{ messages, system }` (key stays server-side, no key in browser)
- [x] `P3.4.4` `anthropic` dialect (byok/local) → `${baseUrl}/v1/messages`; headers `x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access: true`; body carries top-level `system`
- [x] `P3.4.5` `openai` dialect (byok/local) → `${baseUrl}/chat/completions`; header `authorization: Bearer`; fold `system` into a leading system message
- [x] `P3.4.6` Omit the auth header for keyless `local` providers
- [x] `P3.4.7` `parseStream(dialect, reader)` — shared SSE buffering (split on `\n`, keep partial last line, skip malformed JSON, stop on `[DONE]`)
- [x] `P3.4.8` Per-dialect delta extractor: anthropic `content_block_delta → delta.text`; openai `choices[0].delta.content`
- [x] `P3.4.9` Throw on non-ok / missing body with status code in message
- [x] `P3.4.10` Unit tests: all 6 `mode × dialect` cells produce correct url/headers/body; parser handles both SSE fixtures, split buffers, malformed chunks

### 3.5 — AI hook (`hooks/useAI.ts`)
- [x] `P3.5.1` State: `output: string`, `loading: boolean`, `error: string | null`, `history: AIMessage[]`
- [x] `P3.5.2` Read active `provider` + `apiKey` from `settingsStore` (`getActive()` + `keys[provider.id]`)
- [x] `P3.5.3` Guard: no provider → error "No AI provider configured"; `byok` without key → error "needs an API key — open Settings → AI"
- [x] `P3.5.4` `run(userMessage, systemPrompt, contextContent)`:
  - Abort any in-flight `AbortController`
  - Build messages: `[...history, { role: 'user', content: '<document>\n{ctx}\n</document>\n\n{userMessage}' }]`
  - Reset `output`, `error`; set `loading: true`
  - Iterate `streamAI(messages, systemPrompt, provider, apiKey, signal)`, accumulate tokens into `output`
  - On completion: push user + assistant messages to `history`
  - On `AbortError`: swallow silently; on other error: set `error`; always: set `loading: false`
- [x] `P3.5.5` `stop()` — call `abortController.abort()`
- [x] `P3.5.6` `clearHistory()` — reset `history` to `[]`

### 3.6 — Scope context builder (`lib/ai.ts` or `hooks/useAI.ts`)
- [x] `P3.6.1` `buildContext(scope, activeFileId): Promise<string>`
- [x] `P3.6.2` `'file'` → `readFile(activeFileId)`
- [x] `P3.6.3` `'folder'` → list all `.md` files in the active file's parent folder, read each, join with `\n\n---\n\n# {filename}\n\n`
- [x] `P3.6.4` `'all'` → walk entire OPFS tree, read all `.md` files, same join format
- [x] `P3.6.5` Estimate token count (chars / 4); if > 100 000, prompt user with a warning modal before proceeding

### 3.7 — Prompt templates (`lib/prompts.ts`)
- [x] `P3.7.1` Define `SYSTEM_BASE` string
- [x] `P3.7.2` Define `PROMPTS` map with 6 keys: `'Action items'`, `'Decisions'`, `'Questions'`, `'Timeline'`, `'Summary'`, `'Next steps'`
- [x] `P3.7.3` Each value is `SYSTEM_BASE` + task-specific extraction instruction
- [x] `P3.7.4` Export both `SYSTEM_BASE` and `PROMPTS`

### 3.8 — ScopeSelector component (`components/ai/ScopeSelector.tsx`)
- [x] `P3.8.1` Render 3 pill buttons: File / Folder / All
- [x] `P3.8.2` Active: `#0066FF` bg, white Funnel Sans 11px 600 text
- [x] `P3.8.3` Inactive: transparent bg, Funnel Sans 11px `#666666` text
- [x] `P3.8.4` `4px` border radius on each pill
- [x] `P3.8.5` Call `onChange(scope)` on click

### 3.9 — QuickActions component (`components/ai/QuickActions.tsx`)
- [x] `P3.9.1` Render horizontal scrollable chip row (no wrapping)
- [x] `P3.9.2` 6 chips: Action items · Decisions · Questions · Timeline · Summary · Next steps
- [x] `P3.9.3` Chip style: Funnel Sans 11px `#666666`, `#F5F5F5` bg, `#E5E5E5` border, `4px` radius, `4px 8px` padding
- [x] `P3.9.4` On click: set selected chip (highlighted with `#EBF0FF` bg + `#0066FF` text), call `onSelect(promptKey)`

### 3.10 — AIStream component (`components/ai/AIStream.tsx`)
- [x] `P3.10.1` Accept `content: string` prop (streaming markdown output)
- [x] `P3.10.2` Re-run unified+mermaid pipeline on each content update (debounce 100ms to avoid thrashing)
- [x] `P3.10.3` Show 3-dot pulse animation when `loading === true` and `content === ''` (before first token)
- [x] `P3.10.4` Render result as `dangerouslySetInnerHTML` inside a `prose`-classed div (sanitize — see review notes)

### 3.11 — AIPanel component (`components/ai/AIPanel.tsx`)
- [x] `P3.11.1` Header: "AI Assistant" (Inter 600 13px `#1A1A1A`) + `<ScopeSelector>` on the right
- [x] `P3.11.2` Header border-bottom: `1px #E5E5E5`; `0 1px 4px #00000008` shadow
- [x] `P3.11.3` `<QuickActions>` row below header; border-bottom `1px #E5E5E5`
- [x] `P3.11.4` Prompt input: Geist 12px, `#F5F5F5` bg, `#E5E5E5` border, `6px` radius, placeholder "Optional: add focus or constraints…"
- [x] `P3.11.5` `⚡ Summarize` button: Inter 600 12px, `#0066FF` bg, white text, `4px` radius — triggers `run()` with selected scope + quick-action prompt
- [x] `P3.11.6` Stream badge (when loading/done): green dot + Funnel Sans 11px showing **active provider · model · scope · N files** (e.g. "Local — Ollama · llama3.1:8b · Folder · 3 files")
- [x] `P3.11.7` When the active provider is unset or missing a required key, show a "Configure AI" link that opens `<SettingsModal>`
- [x] `P3.11.8` `<AIStream>` output area, `overflow-y: auto`, flex-grows to fill remaining height
- [x] `P3.11.9` Chat input row at bottom: Geist placeholder "Ask a question…", `↑` send button (`#0066FF`, `6px` radius)
- [x] `P3.11.10` Hint row: Funnel Sans 10px `#999999` — "Esc to stop · ⌘/ toggle panel · ⌘K search"
- [x] `P3.11.11` Wire Escape key to `stop()`; wire send button and Enter key to `run()` with chat message
- [x] `P3.11.12` `clearHistory()` button accessible via a small icon or right-click

### 3.12 — Settings modal (`components/settings/SettingsModal.tsx`)
- [x] `P3.12.1` Open from a ⚙ icon (sidebar footer / top bar) or `⌘,`; Minimal Ink styling, `12px` radius, Soft Cloud shadow
- [x] `P3.12.2` "PROVIDER" section: radio cards for each `ProviderConfig` (Folio Cloud · Anthropic · OpenAI · Local — Ollama …); selected = `2px #0066FF` + `#EBF0FF` bg
- [x] `P3.12.3` `+ Add local` ghost button → spawns a new editable `local` card with a uuid id
- [x] `P3.12.4` "CONFIGURATION" fields: dialect pills (Anthropic / OpenAI), Base URL + Model + Max tokens (Geist Mono); cloud cards lock `baseUrl`/`dialect`
- [x] `P3.12.5` API key field: password input + show/hide toggle; hidden for `proxy` and keyless `local`; note "Stored in your browser (localStorage)"
- [x] `P3.12.6` Test connection: 1-token non-streaming probe to the configured endpoint; report latency on success or the error string (catches 401 / CORS / wrong base URL)
- [x] `P3.12.7` Save → write configs to `folio.ai.settings`, keys to `folio.ai.keys`, set active provider, close; Cancel discards
- [x] `P3.12.8` Empty/error hint for `local` mode links CORS setup (Ollama `OLLAMA_ORIGINS`; LM Studio CORS toggle)
- [x] `P3.12.9` Component tests: card select swaps editable fields; key field hidden for `proxy`; Save persists; Test reports success/error

**✓ Phase 3 done when:** Pick a provider in Settings (Proxy / BYOK / Local), paste a transcript, click "Action items", and see a streamed checklist within 2–3 s — with the stream badge naming which provider ran.

---

## Phase 4 — Full-text search + metadata + AI cache
> Goal: ⌘K live search. Tags from frontmatter. Word count in toolbar. AI cache.

### 4.1 — IndexedDB (`lib/indexeddb.ts`)
- [x] `P4.1.1` Open (or upgrade) database `folio-meta` version 1
- [x] `P4.1.2` Create object store `file-meta` with `keyPath: 'path'`; fields: `path`, `wordCount`, `readingTimeSeconds`, `lastModified`, `tags`
- [x] `P4.1.3` Create object store `ai-cache` with `keyPath: 'cacheKey'`; fields: `cacheKey`, `response`, `createdAt`
- [x] `P4.1.4` On DB open: evict `ai-cache` entries where `Date.now() - createdAt > 7 * 86400 * 1000`
- [x] `P4.1.5` Export typed helpers: `getMeta(path)`, `setMeta(meta)`, `getCache(key)`, `setCache(key, response)`, `deleteCache(key)`, `getAllMeta()`

### 4.2 — File metadata computation
- [x] `P4.2.1` In `hooks/useEditor.ts`: after each successful `writeFile`, compute `{ wordCount, readingTimeSeconds: ceil(words/4), lastModified: Date.now(), tags }`
- [x] `P4.2.2` Extract `tags` from frontmatter via `gray-matter(content).data.tags ?? []`
- [x] `P4.2.3` Call `setMeta({ path, wordCount, readingTimeSeconds, lastModified, tags })` to persist
- [x] `P4.2.4` Expose `wordCount` and `readingTimeSeconds` from `useEditor` hook
- [x] `P4.2.5` Update `EditorToolbar` meta row to read live values from hook

### 4.3 — Frontmatter tag pills (`components/editor/EditorToolbar.tsx`)
- [x] `P4.3.1` Parse `tags` array from `gray-matter` on file load
- [x] `P4.3.2` Render each tag as a pill: Funnel Sans 11px `#0066FF`, `#EBF0FF` bg, `4px` radius
- [x] `P4.3.3` Clicking a tag opens search pre-filtered to that tag
- [x] `P4.3.4` Tag autocomplete: when editing frontmatter, suggest all known tags from `getAllMeta()`

### 4.4 — Flexsearch worker (`lib/search-worker.ts`)
- [x] `P4.4.1` Mark file with `/* webworker */` comment; configure Next.js webpack to handle worker build
- [x] `P4.4.2` Create `FlexSearch.Document` with `{ document: { id: 'path', index: ['name', 'content'] }, tokenize: 'forward' }`
- [x] `P4.4.3` Handle `{ type: 'index', payload: FSNode[] }` → bulk `index.add()` each file's `{ path, name, content }`
- [x] `P4.4.4` Handle `{ type: 'search', payload: { query, filter? } }` → `index.search(query, { limit: 20, enrich: true })` → `postMessage({ type: 'results', payload })`
- [x] `P4.4.5` Handle `{ type: 'update', payload: { path, name, content } }` → `index.update()`
- [x] `P4.4.6` Handle `{ type: 'remove', payload: path }` → `index.remove(path)`
- [x] `P4.4.7` Post `{ type: 'indexed' }` after bulk indexing completes

### 4.5 — Search hook (`hooks/useSearch.ts`)
- [x] `P4.5.1` Create `Worker` from `search-worker.ts` once on mount; terminate on unmount
- [x] `P4.5.2` On startup: read all `.md` files from OPFS, send `{ type: 'index', payload }` to worker
- [x] `P4.5.3` `search(query)` → debounce 150ms → send `{ type: 'search' }` → receive `results` via `onmessage`
- [x] `P4.5.4` `updateIndex(path, name, content)` → send `{ type: 'update' }` — called after each file save
- [x] `P4.5.5` `removeFromIndex(path)` → send `{ type: 'remove' }` — called on file delete
- [x] `P4.5.6` Return `{ results, search, loading }`

### 4.6 — SearchModal component (`components/search/SearchModal.tsx`)
- [x] `P4.6.1` Open on ⌘K / Ctrl+K; close on Escape or backdrop click
- [x] `P4.6.2` Backdrop: `rgba(0,0,0,0.4)`; modal: `#FFFFFF`, `12px` radius, Soft Cloud shadow
- [x] `P4.6.3` Search input: Inter 500 15px, `⌕` icon left, `esc` badge right (Funnel Sans `#999999`, `#F5F5F5` bg, `4px` radius border)
- [x] `P4.6.4` Filter tabs: All / Meetings / Projects / Notes — Funnel Sans 11px; active: `#EBF0FF` bg + `#0066FF` text + `4px` radius
- [x] `P4.6.5` Result count: Funnel Sans 11px `#999999` right-aligned in filter row
- [x] `P4.6.6` Result rows: file name (Inter 600 13px `#1A1A1A`) · `·` separator · folder path (Funnel Sans 11px `#999999`) · excerpt (Geist 12px `#666666`)
- [x] `P4.6.7` Active/hovered result: `#EBF0FF` bg, file name turns `#0066FF`
- [x] `P4.6.8` Keyboard: ↑↓ to navigate results, Enter to open file, Tab to preview
- [x] `P4.6.9` Footer: keyboard shortcut hints (Geist Mono keys in `#F5F5F5`/`#E5E5E5` boxes, Funnel Sans labels `#999999`)
- [x] `P4.6.10` On result select: close modal, `setActiveFile(path)`, load content

### 4.7 — AI response cache
- [x] `P4.7.1` In `hooks/useAI.ts`: before calling `streamAI`, compute cache key via `crypto.subtle.digest('SHA-256', encoder.encode(path + content + prompt))`
- [x] `P4.7.2` Check `getCache(key)`; if hit: replay response as synthetic stream (chunk into 20-char pieces at 20ms intervals via `setInterval`), skip API call
- [x] `P4.7.3` If miss: call API, accumulate full response, call `setCache(key, fullResponse)` on completion

**✓ Phase 4 done when:** ⌘K search returns live results across all files, tags appear in toolbar, repeated AI summaries are instant.

---

## Phase 5 — Audio upload + transcription
> Goal: Drop audio → transcribe via Whisper → transcript opens as .md → AI extracts action items.

### 5.1 — AudioUpload component (`components/ai/AudioUpload.tsx`)
- [ ] `P5.1.1` Render drag-and-drop zone: dashed `#E5E5E5` border, `8px` radius, `#FAFAFA` bg, centered `🎙` + Geist 13px label
- [ ] `P5.1.2` Accept file types: `audio/mpeg,audio/wav,audio/mp4,audio/m4a,audio/webm,audio/ogg`
- [ ] `P5.1.3` Validate size < 25MB client-side; show Funnel Sans 12px error if exceeded
- [ ] `P5.1.4` Implement status machine: `idle → uploading → transcribing → done → error`
- [ ] `P5.1.5` Use `XMLHttpRequest` for upload (not `fetch`) to get `upload.onprogress` events
- [ ] `P5.1.6` Show progress bar during upload: `#0066FF` fill on `#E5E5E5` track, Funnel Sans 11px percentage label
- [ ] `P5.1.7` On `xhr.onload`: if status 200, call `onTranscript(responseJSON.text)`; else show error message
- [ ] `P5.1.8` Show "Transcribing…" label (Funnel Sans 12px `#666666`) while Whisper processes after upload completes

### 5.2 — Transcript formatter (`lib/transcriptFormatter.ts`)
- [ ] `P5.2.1` `createTranscriptFile(audioFileName, transcript, targetFolder)` → builds frontmatter + body string:
  ```
  ---
  tags: [transcript, meeting]
  date: {YYYY-MM-DD}
  source: {audioFileName}
  ---

  # {baseName}

  > Transcribed {localeString}

  {transcript}
  ```
- [ ] `P5.2.2` Call `writeFile(path, content)` → `refresh()` → `setActiveFile(path)` → auto-trigger "Action items" quick action

### 5.3 — Text/MD file import
- [ ] `P5.3.1` Add drag-and-drop handler on `Sidebar.tsx` for `.txt` and `.md` files dropped outside the audio upload zone
- [ ] `P5.3.2` On drop: show `ImportModal` with editable filename input and folder selector dropdown
- [ ] `P5.3.3` On confirm: read dropped file text, `writeFile(targetPath, content)`, `refresh()`, open file

### 5.4 — Export modal integration (Audio tab)
- [ ] `P5.4.1` Add "Upload audio" as second tab in `ExportModal` (see Phase 6)
- [ ] `P5.4.2` Render `<AudioUpload>` inside the tab with `onTranscript` wired to transcript formatter

**✓ Phase 5 done when:** Drop a `.m4a` → wait → transcript opens in editor with action items already streaming.

---

## Phase 6 — Export
> Goal: Export current file as HTML, PDF, or DOCX from the Export modal.

### 6.1 — Export modal (`components/export/ExportModal.tsx`)
- [ ] `P6.1.1` Open via toolbar "Export ↓" button or ⌘Shift+P
- [ ] `P6.1.2` Modal: `#FFFFFF`, `12px` radius, Soft Cloud shadow, 520px wide
- [ ] `P6.1.3` Header: "Export document" (Inter 600 15px) + `×` close button
- [ ] `P6.1.4` Tab row: "Export file" · "Upload audio" — Inter 13px; active tab has `2px #0066FF` bottom border
- [ ] `P6.1.5` File name label: Funnel Sans 12px `#999999` showing current file name and word count
- [ ] `P6.1.6` "FORMAT" section label: Funnel Sans 10px 600 `#999999`
- [ ] `P6.1.7` Format cards (PDF, HTML, DOCX, Confluence Wiki):
  - Each card: `8px` radius, `1px #E5E5E5` border normally, `2px #0066FF` + `#EBF0FF` bg when selected
  - Radio circle left, icon, title (Inter 600 13px), description (Funnel Sans 11px `#999999`)
  - PDF selected by default
- [ ] `P6.1.8` Audio drop zone below a divider (same as `AudioUpload` zone)
- [ ] `P6.1.9` Footer: Cancel (Inter 500 `#666666`, `1px #E5E5E5` border) + "Export PDF" (Inter 600 white `#0066FF`, `6px` radius) buttons
- [ ] `P6.1.10` Update footer button label to match selected format ("Export HTML", "Export DOCX")

### 6.2 — Export hook (`hooks/useExport.ts`)
- [ ] `P6.2.1` `exportHTML(content, filename)`:
  - Run unified processor on content (strip frontmatter first)
  - Wrap in `<!DOCTYPE html>` with embedded Geist font `<link>` and inlined Tailwind prose CSS
  - `downloadBlob(html, filename + '.html', 'text/html')`
- [ ] `P6.2.2` `exportPDF(content, filename)`:
  - Open `about:blank` in new window
  - Write rendered HTML with print CSS that hides everything except `.prose` content
  - Call `newWindow.print()`
- [ ] `P6.2.3` `exportDOCX(content, filename)`:
  - Install `docx` npm package
  - Parse markdown via `remark-parse` to get `mdast`
  - Walk `mdast` nodes: `heading` → `HeadingLevel`, `paragraph` → `Paragraph`, `list` → bullet/numbered list, `code` → Geist Mono `TextRun`, `table` → `Table`, `image` with mermaid type → placeholder text
  - `Packer.toBlob(doc)` → `downloadBlob(blob, filename + '.docx')`
- [ ] `P6.2.4` `downloadBlob(blob, filename, mimeType)` — create object URL, click `<a>`, revoke URL

### 6.3 — Confluence export (stretch)
- [ ] `P6.3.1` Convert mdast to Confluence Storage Format XML (h1→h1 macro, code→`<ac:structured-macro ac:name="code">`, etc.)
- [ ] `P6.3.2` `downloadBlob` as `.xml` file with `application/xml` MIME type

**✓ Phase 6 done when:** Export modal opens, selecting PDF and clicking Export opens browser print dialog; HTML download is a self-contained file; DOCX opens cleanly in Word.

---

## Phase 7 — Polish + reliability
> Goal: Error recovery, keyboard shortcuts, vault backup, mobile UX, loading states.

### 7.1 — Error boundaries
- [ ] `P7.1.1` Create `components/ui/ErrorBoundary.tsx` — `React.Component` with `componentDidCatch`, renders inline error banner
- [ ] `P7.1.2` Wrap `<Editor>` in an `ErrorBoundary`
- [ ] `P7.1.3` Wrap `<Preview>` in an `ErrorBoundary`
- [ ] `P7.1.4` Wrap `<AIPanel>` in an `ErrorBoundary`
- [ ] `P7.1.5` OPFS error banner: `#FEF2F2` bg, Geist 13px `#991B1B` text, dismissable with `×`

### 7.2 — Vault backup (`lib/vaultExport.ts`)
- [ ] `P7.2.1` Install `jszip`
- [ ] `P7.2.2` `exportVault()` — walk `getDirectory()` recursively, add each file to a `JSZip` instance preserving folder structure
- [ ] `P7.2.3` Generate zip blob → `downloadBlob(blob, 'folio-backup-{timestamp}.zip')`
- [ ] `P7.2.4` Add "Export vault" option to a Settings menu in the top bar (⚙ icon, Funnel Sans 12px `#666666`)

### 7.3 — Keyboard shortcuts
- [ ] `P7.3.1` Create `hooks/useKeyboardShortcuts.ts` — single `keydown` listener on `document`
- [ ] `P7.3.2` Guard all shortcuts: skip when `event.target` is `INPUT`, `TEXTAREA`, or `[contenteditable]`
- [ ] `P7.3.3` Implement shortcuts:
  - `⌘K` / `Ctrl+K` → open `SearchModal`
  - `⌘/` → `toggleAIPanel()`
  - `⌘E` → cycle `editorMode` (split → source → preview → split)
  - `⌘S` / `Ctrl+S` → force-save current file immediately (bypass debounce)
  - `⌘Shift+P` → open `ExportModal`
  - `⌘N` → create new file in active folder, focus `NewItemInput`
  - `⌘Shift+N` → create new folder in active folder, focus `NewItemInput`
  - `F2` → trigger rename on focused file tree item
  - `Delete` / `Backspace` (when file tree item focused) → show delete confirm dialog
  - `Escape` → close any open modal; cancel AI stream if loading
- [ ] `P7.3.4` Call `useKeyboardShortcuts()` once at root level in `app/page.tsx`

### 7.4 — Mobile layout
- [ ] `P7.4.1` In `AppShell.tsx`: apply `@media (max-width: 767px)` styles — single column, full width
- [ ] `P7.4.2` Render bottom tab bar: Files · Edit · Preview · AI — Funnel Sans 11px `#666666`; active tab `#0066FF`
- [ ] `P7.4.3` Sidebar becomes a full-screen drawer: slides in from left, backdrop click closes it
- [ ] `P7.4.4` AI panel becomes a bottom sheet: draggable handle, default 60vh, dismiss by dragging down
- [ ] `P7.4.5` Bottom tab bar: `48px` height, `#FFFFFF` bg, `1px #E5E5E5` top border, fixed at bottom

### 7.5 — Loading states
- [ ] `P7.5.1` File tree: show 5 skeleton rows (animated pulse, `#F5F5F5` bg, `4px` radius) while `loading === true`
- [ ] `P7.5.2` Search results: show spinner icon in results area while worker is processing
- [ ] `P7.5.3` AI panel: show 3-dot pulse animation (Geist 13px `#999999`) before first token arrives
- [ ] `P7.5.4` Audio upload: show XHR progress bar (see Phase 5)
- [ ] `P7.5.5` File open: show `opacity: 0.5` on editor area while reading file from OPFS

### 7.6 — Shared UI primitives (`components/ui/`)
- [ ] `P7.6.1` `Button.tsx` — variants: `primary` (`#0066FF`), `secondary` (border `#E5E5E5`), `ghost` (no border)
- [ ] `P7.6.2` `Input.tsx` — Geist 12px, `#F5F5F5` bg, `#E5E5E5` border, `6px` radius, focus ring `#0066FF`
- [ ] `P7.6.3` `Modal.tsx` — backdrop, centered container with Soft Cloud shadow and `12px` radius, trap focus
- [ ] `P7.6.4` `Badge.tsx` — Funnel Sans 11px pill, color variants (accent, success, muted)
- [ ] `P7.6.5` `ContextMenu.tsx` — positioned absolutely, `#FFFFFF` bg, `8px` radius, shadow, closes on outside click
- [ ] `P7.6.6` `ConfirmDialog.tsx` — modal with message, Cancel + Confirm (destructive red) buttons

**✓ Phase 7 done when:** App handles errors gracefully, all keyboard shortcuts work, vault zip downloads cleanly, mobile layout is navigable.

---

## Deployment checklist

### Vercel
- [ ] `PD.V.1` Connect GitHub repo to Vercel project
- [ ] `PD.V.2` Add `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in Vercel dashboard → Settings → Environment Variables
- [ ] `PD.V.3` Confirm `vercel.json` has `maxDuration: 60` for `/api/ai` and `120` for `/api/transcribe`
- [ ] `PD.V.4` Verify cold-start on AI route completes before first SSE chunk on a 50k-token context
- [ ] `PD.V.5` Set custom domain (optional): `folio.yourdomain.com`

### Cloud Run (alternative)
- [ ] `PD.CR.1` Set `output: 'standalone'` in `next.config.ts`
- [ ] `PD.CR.2` Write `Dockerfile` (node:22-alpine builder + runner stages)
- [ ] `PD.CR.3` Store `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in GCP Secret Manager
- [ ] `PD.CR.4` Mount secrets as env vars in Cloud Run service config
- [ ] `PD.CR.5` Set Cloud Run `--timeout=120s` to cover long Whisper transcription jobs
- [ ] `PD.CR.6` Configure min instances = 1 to avoid cold-start latency on first request

---

## Progress summary

| Phase | Tasks | Status |
|---|---|---|
| 1 — Skeleton + editor | 1.1–1.8 | ✅ Done |
| 2 — OPFS + file tree | 2.1–2.8 | ✅ Done |
| 3 — AI provider layer + streaming | 3.1–3.12 | ✅ Done |
| 4 — Search + metadata + cache | 4.1–4.7 | ⬜ Not started |
| 5 — Audio + transcription | 5.1–5.4 | ⬜ Not started |
| 6 — Export | 6.1–6.3 | ⬜ Not started |
| 7 — Polish + reliability | 7.1–7.6 | ⬜ Not started |
| Deployment | Vercel / Cloud Run | ⬜ Not started |
