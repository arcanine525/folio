import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetOpfs } from "@/__mocks__/opfs";
import { __resetRootForTests } from "@/lib/opfs";
import { useAppStore } from "@/store/appStore";
import { useFileTree } from "@/hooks/useFileTree";
import type { FSNode } from "@/types";

function resetStore() {
  useAppStore.setState({ tree: [], activeFileId: null, content: "" });
}

describe("hooks/useFileTree", () => {
  beforeEach(async () => {
    __resetOpfs();
    await __resetRootForTests();
    resetStore();
  });

  it("starts loading and clears it after the initial OPFS scan", async () => {
    const { result } = renderHook(() => useFileTree());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tree).toEqual([]);
  });

  it("createFile writes a file and surfaces it in the tree", async () => {
    const { result } = renderHook(() => useFileTree());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createFile("notes.md", "# Notes");
    });

    expect(result.current.tree).toEqual([
      { type: "file", name: "notes.md", path: "notes.md" },
    ]);
  });

  it("createFolder adds a folder (with empty children)", async () => {
    const { result } = renderHook(() => useFileTree());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createFolder("meetings");
    });

    expect(result.current.tree).toEqual([
      { type: "folder", name: "meetings", path: "meetings", children: [] },
    ]);
  });

  it("deleteNode removes a file", async () => {
    const { result } = renderHook(() => useFileTree());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.createFile("doomed.md");
    });

    await act(async () => {
      await result.current.deleteNode({ type: "file", name: "doomed.md", path: "doomed.md" });
    });

    expect(result.current.tree).toEqual([]);
  });

  it("deleteNode removes a folder recursively", async () => {
    const { result } = renderHook(() => useFileTree());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.createFolder("box");
      await result.current.createFile("box/a.md", "x");
    });

    await act(async () => {
      await result.current.deleteNode({
        type: "folder",
        name: "box",
        path: "box",
        children: [],
      });
    });

    expect(result.current.tree).toEqual([]);
  });

  it("renameNode renames a file and returns the new path", async () => {
    const { result } = renderHook(() => useFileTree());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.createFile("old.md", "x");
    });

    let newPath = "";
    await act(async () => {
      newPath = await result.current.renameNode(
        { type: "file", name: "old.md", path: "old.md" },
        "new.md",
      );
    });

    expect(newPath).toBe("new.md");
    expect(result.current.tree).toEqual([
      { type: "file", name: "new.md", path: "new.md" },
    ]);
  });

  it("refresh re-scans and reflects external OPFS changes", async () => {
    const { result } = renderHook(() => useFileTree());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate an out-of-band write by calling the opfs primitive directly.
    const opfs = await import("@/lib/opfs");
    await opfs.writeFile("external.md", "");

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.tree).toEqual([
      { type: "file", name: "external.md", path: "external.md" },
    ]);
  });

  it("keeps folders ahead of files in the rendered tree", async () => {
    const { result } = renderHook(() => useFileTree());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createFile("z-file.md");
      await result.current.createFolder("a-folder");
      await result.current.createFile("m-file.md");
    });

    const ordered: FSNode[] = result.current.tree;
    expect(ordered.map((n) => n.name)).toEqual(["a-folder", "m-file.md", "z-file.md"]);
  });
});
