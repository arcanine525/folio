// Folio — shared domain types
// Source of truth for shapes used across the file tree, AI, metadata, and export.

/** A node in the OPFS-backed file tree. `path` doubles as the file id. */
export type FSNodeType = "file" | "folder";

export interface FSNode {
  type: FSNodeType;
  /** Display name, e.g. "standup.md" or "meetings". */
  name: string;
  /** Full OPFS path (folders joined by "/"), e.g. "meetings/standup.md". */
  path: string;
  /** Present only when `type === "folder"`. */
  children?: FSNode[];
}

/** A single chat turn sent to / received from the Claude proxy. */
export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

/** How much surrounding context the AI operates on. */
export type AIScope = "file" | "folder" | "all";

/** Formats supported by the Export modal. */
export type ExportFormat = "pdf" | "html" | "docx" | "confluence";

/** Per-file metadata persisted to IndexedDB (file-meta store). */
export interface FileMeta {
  path: string;
  wordCount: number;
  /** Rough estimate: ceil(wordCount / 4) — used for "~N min read". */
  readingTimeSeconds: number;
  lastModified: number;
  /** Tags pulled from frontmatter (`tags:` array). */
  tags: string[];
}

// ── AI provider layer (Phase 3) ──────────────────────────────────────
// Two-axis model: `mode` (where the request goes) × `dialect` (wire format).
// See docs/ai-provider-design.md §2–§3.

/** Where the inference request is sent. */
export type ProviderMode = "proxy" | "byok" | "local";

/** Wire format of the request/response. */
export type ApiDialect = "anthropic" | "openai";

/** A fully-resolved provider the user can select and run against. */
export interface ProviderConfig {
  /** Stable id, e.g. "byok-anthropic" or a uuid for custom local servers. */
  id: string;
  /** Display label in the settings modal + stream badge. */
  label: string;
  mode: ProviderMode;
  dialect: ApiDialect;
  /** Base URL. Ignored for `proxy`. e.g. "https://api.anthropic.com" or "http://localhost:11434/v1". */
  baseUrl: string;
  /** Model id, e.g. "claude-sonnet-4-6", "gpt-4o-mini", "llama3.1:8b". */
  model: string;
  /** Upper bound on output tokens. */
  maxTokens: number;
}

/** Persisted AI settings. Keys are stored separately from configs (see settingsStore). */
export interface AISettings {
  /** id of the currently active ProviderConfig. */
  activeProviderId: string;
  /** Built-in + user-defined providers. */
  providers: ProviderConfig[];
  /** API keys, keyed by ProviderConfig.id. Never logged. */
  keys: Record<string, string>;
}
