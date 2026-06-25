import { beforeEach, describe, expect, it } from "vitest";
import {
  createSearchIndex,
  indexFiles,
  removeIndex,
  searchIndex,
  updateIndex,
  type IndexableDoc,
} from "@/lib/searchIndex";

function doc(path: string, name: string, content: string, tags: string[] = []): IndexableDoc {
  const fm = tags.length ? `---\ntags: [${tags.join(", ")}]\n---\n` : "";
  return { path, name, content: fm + content };
}

describe("lib/searchIndex", () => {
  let index: ReturnType<typeof createSearchIndex>;

  beforeEach(() => {
    index = createSearchIndex();
  });

  it("matches documents by their file name", () => {
    indexFiles(index, [
      doc("a.md", "standup.md", "daily notes"),
      doc("b.md", "retro.md", "team meeting"),
    ]);
    const results = searchIndex(index, "standup");
    expect(results.map((r) => r.path)).toEqual(["a.md"]);
  });

  it("matches documents by their content", () => {
    indexFiles(index, [
      doc("a.md", "a.md", "the quick brown fox"),
      doc("b.md", "b.md", "nothing here"),
    ]);
    const results = searchIndex(index, "brown");
    expect(results.map((r) => r.path)).toEqual(["a.md"]);
  });

  it("returns an empty list for a blank query", () => {
    indexFiles(index, [doc("a.md", "a.md", "hello")]);
    expect(searchIndex(index, "   ")).toEqual([]);
    expect(searchIndex(index, "")).toEqual([]);
  });

  it("deduplicates a document matched in both name and content", () => {
    indexFiles(index, [doc("sprint.md", "sprint.md", "sprint planning notes")]);
    const results = searchIndex(index, "sprint");
    expect(results.length).toBe(1);
    expect(results[0].path).toBe("sprint.md");
  });

  it("builds an excerpt that contains the matched term", () => {
    indexFiles(index, [doc("a.md", "a.md", "alpha bravo charlie delta echo")]);
    const results = searchIndex(index, "charlie");
    expect(results[0].excerpt.toLowerCase()).toContain("charlie");
  });

  it("respects the result limit", () => {
    indexFiles(
      index,
      Array.from({ length: 10 }, (_, i) => doc(`f${i}.md`, `f${i}.md`, "shared keyword")),
    );
    expect(searchIndex(index, "shared", undefined, 3).length).toBe(3);
  });

  it("reflects updated content after updateIndex", () => {
    indexFiles(index, [doc("a.md", "a.md", "old content")]);
    expect(searchIndex(index, "freshman").map((r) => r.path)).toEqual([]);
    updateIndex(index, doc("a.md", "a.md", "freshman content now"));
    expect(searchIndex(index, "freshman").map((r) => r.path)).toEqual(["a.md"]);
  });

  it("drops a document after removeIndex", () => {
    indexFiles(index, [doc("a.md", "a.md", "keepme"), doc("b.md", "b.md", "keepme")]);
    removeIndex(index, "a.md");
    expect(searchIndex(index, "keepme").map((r) => r.path)).toEqual(["b.md"]);
  });

  it("filters results to a tag present in frontmatter", () => {
    indexFiles(index, [
      doc("a.md", "a.md", "project plan", ["internal"]),
      doc("b.md", "b.md", "project plan", ["public"]),
    ]);
    const results = searchIndex(index, "project", { tag: "internal" });
    expect(results.map((r) => r.path)).toEqual(["a.md"]);
  });

  it("filters results by path prefix (folder scope)", () => {
    indexFiles(index, [
      doc("meetings/a.md", "a.md", "standup notes"),
      doc("projects/b.md", "b.md", "standup notes"),
    ]);
    const results = searchIndex(index, "standup", { pathPrefix: "meetings" });
    expect(results.map((r) => r.path)).toEqual(["meetings/a.md"]);
  });
});
