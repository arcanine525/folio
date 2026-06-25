import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetOpfs,
  __opfsRoot,
} from "@/__mocks__/opfs";
import {
  __resetRootForTests,
  createFolder,
  deleteFile,
  deleteFolder,
  listTree,
  readFile,
  renameEntry,
  writeFile,
} from "@/lib/opfs";

describe("lib/opfs", () => {
  beforeEach(async () => {
    __resetOpfs();
    await __resetRootForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("writeFile / readFile", () => {
    it("round-trips file content", async () => {
      await writeFile("note.md", "# Hello OPFS");
      await expect(readFile("note.md")).resolves.toBe("# Hello OPFS");
    });

    it("overwrites existing content", async () => {
      await writeFile("note.md", "v1");
      await writeFile("note.md", "v2");
      await expect(readFile("note.md")).resolves.toBe("v2");
    });

    it("creates nested folders on the way down", async () => {
      await writeFile("meetings/2024/standup.md", "content");
      await expect(readFile("meetings/2024/standup.md")).resolves.toBe(
        "content",
      );
    });

    it("rejects when reading a missing file", async () => {
      await expect(readFile("nope.md")).rejects.toThrow();
    });
  });

  describe("createFolder", () => {
    it("creates nested folders", async () => {
      await createFolder("projects/folio");
      const root = __opfsRoot();
      const projects = await root.getDirectoryHandle("projects");
      await expect(projects.getDirectoryHandle("folio")).resolves.toBeTruthy();
    });

    it("is idempotent for an existing folder", async () => {
      await createFolder("projects");
      await expect(createFolder("projects")).resolves.toBeUndefined();
      // Still exactly one entry at root.
      const entries = [];
      for await (const [name] of __opfsRoot().entries()) entries.push(name);
      expect(entries).toEqual(["projects"]);
    });
  });

  describe("deleteFile", () => {
    it("removes a file", async () => {
      await writeFile("doomed.md", "x");
      await deleteFile("doomed.md");
      await expect(readFile("doomed.md")).rejects.toThrow();
    });

    it("rejects when the file does not exist", async () => {
      await expect(deleteFile("ghost.md")).rejects.toThrow();
    });
  });

  describe("deleteFolder", () => {
    it("removes a folder and its contents recursively", async () => {
      await writeFile("folder/a.md", "1");
      await writeFile("folder/sub/b.md", "2");
      await deleteFolder("folder");
      const tree = await listTree();
      expect(tree).toHaveLength(0);
    });

    it("rejects when the folder does not exist", async () => {
      await expect(deleteFolder("ghost")).rejects.toThrow();
    });
  });

  describe("renameEntry", () => {
    it("copies content to the new path, returns it, and removes the old", async () => {
      await writeFile("old.md", "payload");
      const newPath = await renameEntry("old.md", "new.md");
      expect(newPath).toBe("new.md");
      await expect(readFile("new.md")).resolves.toBe("payload");
      await expect(readFile("old.md")).rejects.toThrow();
    });

    it("keeps the parent directory when renaming", async () => {
      await writeFile("notes/q1.md", "x");
      const newPath = await renameEntry("notes/q1.md", "q2.md");
      expect(newPath).toBe("notes/q2.md");
      await expect(readFile("notes/q2.md")).resolves.toBe("x");
    });

    it("rejects when newName contains a slash", async () => {
      await writeFile("a.md", "x");
      await expect(renameEntry("a.md", "nested/name.md")).rejects.toThrow();
    });

    it("rejects when renaming a folder", async () => {
      await createFolder("afolder");
      await expect(renameEntry("afolder", "bfolder")).rejects.toThrow();
    });
  });

  describe("listTree", () => {
    it("returns an empty tree when nothing is stored", async () => {
      await expect(listTree()).resolves.toEqual([]);
    });

    it("sorts folders before files, then alphabetically", async () => {
      // Folders: zeta, alpha. Files: mango.md, apple.md.
      await createFolder("zeta");
      await createFolder("alpha");
      await writeFile("mango.md", "");
      await writeFile("apple.md", "");

      const tree = await listTree();
      expect(tree.map((n) => n.name)).toEqual([
        "alpha",
        "zeta",
        "apple.md",
        "mango.md",
      ]);
      expect(tree[0].type).toBe("folder");
      expect(tree[2].type).toBe("file");
    });

    it("nests children under folders with correct paths", async () => {
      await writeFile("alpha/nested.md", "x");
      await writeFile("root.md", "y");

      const tree = await listTree();
      expect(tree).toHaveLength(2);
      const alpha = tree.find((n) => n.name === "alpha");
      expect(alpha?.children).toEqual([
        { type: "file", name: "nested.md", path: "alpha/nested.md" },
      ]);
      expect(tree.find((n) => n.name === "root.md")?.path).toBe("root.md");
    });

    it("produces folders-first ordering at every level", async () => {
      await writeFile("alpha/z-file.md", "");
      await createFolder("alpha/sub");
      const tree = await listTree();
      const alpha = tree.find((n) => n.name === "alpha");
      expect(alpha?.children?.map((n) => n.name)).toEqual(["sub", "z-file.md"]);
    });
  });

  describe("root caching", () => {
    it("calls navigator.storage.getDirectory at most once across operations", async () => {
      const spy = vi.spyOn(navigator.storage, "getDirectory");
      await writeFile("a.md", "1");
      await writeFile("b.md", "2");
      await readFile("a.md");
      await listTree();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("re-fetches the root after the cache is reset", async () => {
      const spy = vi.spyOn(navigator.storage, "getDirectory");
      await writeFile("a.md", "1");
      await __resetRootForTests();
      await readFile("a.md");
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
