import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as opfs from "@/lib/opfs";
import { __resetRootForTests } from "@/lib/opfs";
import { buildContext, CONTEXT_TOKEN_WARNING, estimateContextTokens } from "@/lib/ai";

// lib/opfs reads/writes through the in-memory navigator.storage mock installed
// in vitest.setup.ts, so we can seed the fake FS with opfs.writeFile directly.
async function seed() {
  await opfs.writeFile("standup.md", "# Standup\n\nnotes for today");
  await opfs.writeFile("meetings/mon.md", "Monday meeting notes");
  await opfs.writeFile("meetings/tue.md", "Tuesday meeting notes");
  await opfs.writeFile("meetings/sub/deep.md", "Nested notes");
  await opfs.writeFile("projects/p1.md", "Project one");
  await opfs.writeFile("notes.txt", "ignored non-markdown");
}

describe("buildContext", () => {
  beforeEach(async () => {
    await __resetRootForTests();
    await seed();
  });

  afterEach(async () => {
    await __resetRootForTests();
  });

  it("'file' scope returns the active file verbatim with a token estimate", async () => {
    const ctx = await buildContext("file", "standup.md");
    expect(ctx.content).toBe("# Standup\n\nnotes for today");
    expect(ctx.fileCount).toBe(1);
    expect(ctx.tokens).toBe(estimateContextTokens(ctx.content));
    expect(ctx.overLimit).toBe(false);
  });

  it("'file' scope with no active file returns empty content", async () => {
    const ctx = await buildContext("file", null);
    expect(ctx.content).toBe("");
    expect(ctx.fileCount).toBe(0);
  });

  it("'folder' scope includes every .md under the active file's parent folder", async () => {
    const ctx = await buildContext("folder", "meetings/mon.md");
    // meetings/ contains mon, tue, and the nested sub/deep.
    expect(ctx.fileCount).toBe(3);
    expect(ctx.content).toContain("# mon.md");
    expect(ctx.content).toContain("Monday meeting notes");
    expect(ctx.content).toContain("# tue.md");
    expect(ctx.content).toContain("# deep.md");
    expect(ctx.content).toContain("Nested notes");
    // Blocks are separated by ---.
    expect(ctx.content).toContain("\n\n---\n\n");
    // Nothing outside the folder leaks in.
    expect(ctx.content).not.toContain("Project one");
    expect(ctx.content).not.toContain("Standup");
  });

  it("'folder' scope for a root-level file stays at the root (does not collapse to all)", async () => {
    const ctx = await buildContext("folder", "standup.md");
    expect(ctx.content).toContain("# standup.md");
    expect(ctx.content).not.toContain("Project one");
    expect(ctx.content).not.toContain("Monday meeting");
  });

  it("'all' scope walks the entire tree, .md only, ignoring non-markdown", async () => {
    const ctx = await buildContext("all", null);
    expect(ctx.fileCount).toBe(5); // standup + 3 meetings + projects/p1
    expect(ctx.content).not.toContain("ignored non-markdown");
    expect(ctx.content).toContain("# p1.md");
  });

  it("flags overLimit when the context exceeds the warning threshold", async () => {
    // tokens ≈ chars / 4, so push past 100k tokens (> 400k chars).
    const huge = "x".repeat(CONTEXT_TOKEN_WARNING * 4 + 100);
    await opfs.writeFile("big.md", huge);
    const ctx = await buildContext("file", "big.md");
    expect(ctx.overLimit).toBe(true);
    expect(ctx.tokens).toBeGreaterThan(CONTEXT_TOKEN_WARNING);
  });
});
