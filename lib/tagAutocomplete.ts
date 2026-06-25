// Folio — frontmatter tag autocomplete (P4.3.4).
//
// Pure logic (no CodeMirror) so it can be unit-tested directly. The Editor
// component adapts it into a CodeMirror `autocompletion` source: it decides
// whether the cursor is inside the frontmatter `tags:` value and, if so,
// returns the known tags that prefix-match the partial word being typed.

export interface TagCompletionInput {
  /** Document split into lines (no trailing newline per entry). */
  lines: string[];
  /** 1-based line number the cursor is on. */
  lineNumber: number;
  /** The partial word being typed (the token just before the cursor). */
  partial: string;
}

/** Range of the leading frontmatter block, in 1-based line numbers, or null. */
export function frontmatterRangeFromLines(
  lines: string[],
): { startLine: number; endLine: number } | null {
  if (lines[0]?.trim() !== "---") return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return { startLine: 1, endLine: i + 1 };
  }
  return null; // unclosed frontmatter — treat as none
}

/**
 * True if `lineNumber` sits inside a frontmatter block AND falls under the
 * `tags:` key (inline `tags: [...]` or a block list beneath a `tags:` header).
 */
function inTagsValue(lines: string[], lineNumber: number): boolean {
  for (let n = lineNumber; n >= 1; n--) {
    const line = lines[n - 1] ?? "";
    const keyMatch = line.match(/^([A-Za-z][\w-]*)\s*:/);
    if (keyMatch) return keyMatch[1].toLowerCase() === "tags";
    // Blank lines or list items (`- …`) keep scanning upward for the owning key.
  }
  return false;
}

/**
 * Suggest known tags that prefix-match the partial being typed, or `null` when
 * the cursor is not in a completable tags context. Duplicates are removed and
 * the result preserves first-seen order.
 */
export function suggestTags(
  input: TagCompletionInput,
  knownTags: string[],
): string[] | null {
  const { lines, lineNumber, partial } = input;
  const fm = frontmatterRangeFromLines(lines);
  if (!fm) return null;
  if (lineNumber < fm.startLine || lineNumber > fm.endLine) return null;
  if (!inTagsValue(lines, lineNumber)) return null;

  const prefix = partial.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of knownTags) {
    if (typeof tag !== "string" || seen.has(tag)) continue;
    if (tag.toLowerCase().startsWith(prefix)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}
