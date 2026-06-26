import { describe, expect, it } from "vitest";
import { frontmatterRangeFromLines, suggestTags } from "@/lib/tagAutocomplete";

describe("lib/tagAutocomplete", () => {
  describe("frontmatterRangeFromLines", () => {
    it("finds a closed frontmatter block", () => {
      const lines = ["---", "tags: [a]", "---", "# body"];
      expect(frontmatterRangeFromLines(lines)).toEqual({ startLine: 1, endLine: 3 });
    });

    it("returns null when there is no leading ---", () => {
      expect(frontmatterRangeFromLines(["# title", "tags: [a]"])).toBeNull();
    });

    it("returns null for unclosed frontmatter", () => {
      expect(frontmatterRangeFromLines(["---", "tags: [a]", "body"])).toBeNull();
    });
  });

  describe("suggestTags", () => {
    const known = ["meeting", "meeting-notes", "project", "q3", "quick"];

    it("returns null outside any frontmatter", () => {
      const lines = ["# title", "tags: [m]"];
      expect(suggestTags({ lines, lineNumber: 2, partial: "m" }, known)).toBeNull();
    });

    it("returns null on a non-tags frontmatter key", () => {
      const lines = ["---", "title: type here", "---"];
      expect(suggestTags({ lines, lineNumber: 2, partial: "t" }, known)).toBeNull();
    });

    it("suggests prefix matches on the inline tags line", () => {
      const lines = ["---", "tags: [mee]", "---"];
      // "mee" matches "meeting" and "meeting-notes"
      expect(suggestTags({ lines, lineNumber: 2, partial: "mee" }, known)).toEqual([
        "meeting",
        "meeting-notes",
      ]);
    });

    it("suggests matches for a block-list item under tags", () => {
      const lines = ["---", "tags:", "  - pro", "other: x", "---"];
      expect(suggestTags({ lines, lineNumber: 3, partial: "pro" }, known)).toEqual(["project"]);
    });

    it("does not suggest for a block-list item under a different key", () => {
      const lines = ["---", "people:", "  - pro", "---"];
      expect(suggestTags({ lines, lineNumber: 3, partial: "pro" }, known)).toBeNull();
    });

    it("is case-insensitive on the partial", () => {
      const lines = ["---", "tags: [Q]", "---"];
      // Capital "Q" matches lowercase "q3" and "quick".
      expect(suggestTags({ lines, lineNumber: 2, partial: "Q" }, known)).toEqual([
        "q3",
        "quick",
      ]);
    });

    it("deduplicates known tags", () => {
      const lines = ["---", "tags: [m]", "---"];
      expect(suggestTags({ lines, lineNumber: 2, partial: "m" }, ["m", "m", "meeting"])).toEqual([
        "m",
        "meeting",
      ]);
    });

    it("returns an empty list (not null) when in context but nothing matches", () => {
      const lines = ["---", "tags: [zzz]", "---"];
      expect(suggestTags({ lines, lineNumber: 2, partial: "zzz" }, known)).toEqual([]);
    });
  });
});
