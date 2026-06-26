// Folio — FlexSearch index logic (P4.4).
//
// All FlexSearch access lives here so the rest of the app (and the tests) never
// touch the library directly. The Document index is keyed by `path` and indexes
// both `name` and `content` with forward tokenization. This module also defines
// the worker message types shared by lib/search-worker.ts and hooks/useSearch.ts.

import FlexSearch from "flexsearch";
import { extractTags } from "@/lib/metadata";

/** A file ready to be indexed / searched. */
export interface IndexableDoc {
  /** Full OPFS path — the FlexSearch document id. */
  path: string;
  /** Display name (e.g. "standup.md"). */
  name: string;
  /** Raw file contents (frontmatter included — tags live there). */
  content: string;
}

/** A single search hit returned to the UI. */
export interface SearchResult {
  path: string;
  name: string;
  excerpt: string;
}

/** Optional post-filters applied after FlexSearch returns matches. */
export interface SearchFilter {
  /** Only keep files tagged with this tag (matched against frontmatter). */
  tag?: string;
  /** Only keep files whose path starts with this prefix (a folder scope). */
  pathPrefix?: string;
}

/** Minimal structural type over a FlexSearch.Document instance. The library's
 *  own typings are awkward across versions, so we type the surface we use and
 *  create the instance via a single explicit cast at the module boundary. */
export interface SearchIndex {
  add(doc: IndexableDoc): void;
  update(doc: IndexableDoc): void;
  remove(id: string): void;
  search(
    query: string,
    options: { limit: number; enrich: boolean },
  ): Array<{ field: string; result: Array<{ id: string; doc: IndexableDoc }> }>;
}

/** Per-field search result returned by FlexSearch.Document.search. */
type FieldResults = SearchIndex["search"] extends (...args: never[]) => infer R ? R : never;

/** Create a fresh FlexSearch.Document index with the project schema. */
export function createSearchIndex(): SearchIndex {
  return new FlexSearch.Document({
    // `store: true` retains the full document so `enrich: true` search results
    // carry their content back to the main thread (needed for excerpts).
    document: { id: "path", index: ["name", "content"], store: true },
    tokenize: "forward",
  }) as unknown as SearchIndex;
}

/** Bulk-add files to the index (the worker's startup path). */
export function indexFiles(index: SearchIndex, docs: IndexableDoc[]): void {
  for (const doc of docs) index.add(doc);
}

/** Re-index a single file after a save. */
export function updateIndex(index: SearchIndex, doc: IndexableDoc): void {
  index.update(doc);
}

/** Drop a file from the index after a delete. */
export function removeIndex(index: SearchIndex, path: string): void {
  index.remove(path);
}

/** Strip a leading YAML frontmatter block so excerpts come from the body. */
function stripFrontmatter(text: string): string {
  return text.replace(/^---[\s\S]*?---/, "").trim();
}

/** True if `content`'s frontmatter tags include `tag` (case-insensitive). */
function hasTag(content: string, tag: string): boolean {
  const lower = tag.toLowerCase();
  return extractTags(content).some((t) => t.toLowerCase() === lower);
}

/** Build a short excerpt around the first match of `query` in the body. */
function buildExcerpt(content: string, query: string, radius = 40): string {
  const body = stripFrontmatter(content).replace(/\s+/g, " ").trim();
  if (!body) return "";
  const idx = body.toLowerCase().indexOf(query.toLowerCase());
  const start = idx === -1 ? 0 : Math.max(0, idx - radius);
  const end = Math.min(body.length, start + radius * 2 + query.length);
  const snippet = body.slice(start, end).trim();
  const prefix = start > 0 ? "… " : "";
  const suffix = end < body.length ? " …" : "";
  return prefix + snippet + suffix;
}

/**
 * Search the index, merge per-field hits, dedupe by path, apply post-filters,
 * and return up to `limit` results with excerpts. An empty/blank query yields
 * no results (the UI shows the file list instead).
 */
export function searchIndex(
  index: SearchIndex,
  query: string,
  filter?: SearchFilter,
  limit = 20,
): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const fields = index.search(trimmed, { limit: limit * 2, enrich: true }) as FieldResults;
  const byPath = new Map<string, IndexableDoc>();
  for (const field of fields) {
    for (const hit of field.result) {
      const doc = hit.doc;
      if (doc && !byPath.has(doc.path)) byPath.set(doc.path, doc);
    }
  }

  let docs = [...byPath.values()];
  if (filter?.pathPrefix) {
    const prefix = filter.pathPrefix;
    docs = docs.filter((d) => d.path === prefix || d.path.startsWith(`${prefix}/`));
  }
  if (filter?.tag) {
    docs = docs.filter((d) => hasTag(d.content, filter.tag as string));
  }

  return docs.slice(0, limit).map((d) => ({
    path: d.path,
    name: d.name,
    excerpt: buildExcerpt(d.content, trimmed),
  }));
}

// ── Worker message contract ────────────────────────────────────────────────
// Inbound messages the worker handles; outbound messages it posts back.

export interface WorkerIndexMessage {
  type: "index";
  payload: IndexableDoc[];
}
export interface WorkerSearchMessage {
  type: "search";
  payload: { query: string; filter?: SearchFilter };
}
export interface WorkerUpdateMessage {
  type: "update";
  payload: IndexableDoc;
}
export interface WorkerRemoveMessage {
  type: "remove";
  payload: string;
}
export type WorkerInbound =
  | WorkerIndexMessage
  | WorkerSearchMessage
  | WorkerUpdateMessage
  | WorkerRemoveMessage;

export interface WorkerResultsMessage {
  type: "results";
  payload: SearchResult[];
}
export interface WorkerIndexedMessage {
  type: "indexed";
}
export type WorkerOutbound = WorkerResultsMessage | WorkerIndexedMessage;
