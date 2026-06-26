import { describe, expect, it } from "vitest";
import { computeMeta, countWords, extractTags } from "@/lib/metadata";

describe("lib/metadata", () => {
  describe("countWords", () => {
    it("returns 0 for empty content", () => {
      expect(countWords("")).toBe(0);
    });

    it("counts words in plain text", () => {
      expect(countWords("one two three four")).toBe(4);
    });

    it("ignores a leading frontmatter block", () => {
      const md = "---\ntitle: Hi\ntags: [a]\n---\nhello world";
      expect(countWords(md)).toBe(2);
    });

    it("collapses whitespace runs", () => {
      expect(countWords("a\n\n  b\t\tc")).toBe(3);
    });
  });

  describe("extractTags", () => {
    it("returns an empty array when there is no frontmatter", () => {
      expect(extractTags("# No frontmatter")).toEqual([]);
    });

    it("reads an inline tags array", () => {
      const md = "---\ntags: [meeting, q3]\n---\nbody";
      expect(extractTags(md)).toEqual(["meeting", "q3"]);
    });

    it("reads a block-style tags list", () => {
      const md = "---\ntags:\n  - one\n  - two\n---\n";
      expect(extractTags(md)).toEqual(["one", "two"]);
    });

    it("returns [] when tags is not an array", () => {
      const md = "---\ntags: meeting\n---\n";
      expect(extractTags(md)).toEqual([]);
    });

    it("drops non-string tag entries", () => {
      const md = "---\ntags: [ok, 42, good]\n---\n";
      expect(extractTags(md)).toEqual(["ok", "good"]);
    });
  });

  describe("computeMeta", () => {
    it("assembles a FileMeta row with derived reading time and tags", () => {
      const md = "---\ntags: [meeting]\n---\nalpha bravo charlie delta echo";
      // 5 words → ceil(5/4) = 2 seconds
      const meta = computeMeta("notes/a.md", md);
      expect(meta.path).toBe("notes/a.md");
      expect(meta.wordCount).toBe(5);
      expect(meta.readingTimeSeconds).toBe(2);
      expect(meta.tags).toEqual(["meeting"]);
      expect(typeof meta.lastModified).toBe("number");
    });

    it("handles a file with no frontmatter or tags", () => {
      const meta = computeMeta("x.md", "just some words here");
      expect(meta.wordCount).toBe(4);
      expect(meta.tags).toEqual([]);
      expect(meta.readingTimeSeconds).toBe(Math.ceil(4 / 4));
    });
  });
});
