// Folio — file metadata computation (P4.2).
//
// Word counting stays lightweight (regex frontmatter strip, no parse) so it can
// run on every render of the editor toolbar; tag extraction uses gray-matter
// and is only invoked on save. `computeMeta` assembles the FileMeta row the
// useEditor hook persists to IndexedDB after each successful write.

import matter from "gray-matter";
import type { FileMeta } from "@/types";

/** Strip a leading YAML frontmatter block (--- … ---) without parsing it. */
function stripFrontmatter(text: string): string {
  return text.replace(/^---[\s\S]*?---/, "").trim();
}

/** Count whitespace-separated words in the body, ignoring frontmatter. */
export function countWords(content: string): number {
  const body = stripFrontmatter(content);
  if (!body) return 0;
  return body.split(/\s+/).filter(Boolean).length;
}

/**
 * Pull the `tags` array out of frontmatter. YAML allows tags as a block list
 * (`- tag`) or inline (`[a, b]`); gray-matter normalises both to an array.
 * Non-string entries are dropped, and missing/non-array `tags` yields `[]`.
 */
export function extractTags(content: string): string[] {
  let data: Record<string, unknown>;
  try {
    data = matter(content).data as Record<string, unknown>;
  } catch {
    return [];
  }
  const tags = data?.tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => typeof t === "string");
}

/**
 * Build the persisted FileMeta row for a file. Reading time is the word count
 * divided by 4 words/second (≈ 240 wpm), expressed in seconds and rounded up.
 */
export function computeMeta(path: string, content: string): FileMeta {
  const wordCount = countWords(content);
  return {
    path,
    wordCount,
    readingTimeSeconds: Math.ceil(wordCount / 4),
    lastModified: Date.now(),
    tags: extractTags(content),
  };
}
