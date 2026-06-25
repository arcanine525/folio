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
