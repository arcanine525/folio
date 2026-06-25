import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetOpfs } from "@/__mocks__/opfs";
import * as opfs from "@/lib/opfs";
import { __resetRootForTests } from "@/lib/opfs";
import {
  __setAutosaveDebounceForTests,
  useEditor,
} from "@/hooks/useEditor";
import { useAppStore } from "@/store/appStore";

function resetStore() {
  useAppStore.setState({ tree: [], activeFileId: null, content: "", savedContent: "" });
}

describe("hooks/useEditor", () => {
  beforeEach(async () => {
    __resetOpfs();
    await __resetRootForTests();
    resetStore();
    __setAutosaveDebounceForTests(800);
  });

  afterEach(() => {
    __setAutosaveDebounceForTests(800);
  });

  it("starts empty and clean with no active file", async () => {
    const { result } = renderHook(() => useEditor());
    expect(result.current.content).toBe("");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it("loads the active file's content from OPFS", async () => {
    await opfs.writeFile("note.md", "hello world");
    useAppStore.setState({ activeFileId: "note.md" });

    const { result } = renderHook(() => useEditor());
    await waitFor(() => expect(result.current.content).toBe("hello world"));
    expect(result.current.isDirty).toBe(false);
  });

  it("clears the buffer when the active file is unset", async () => {
    await opfs.writeFile("note.md", "keep");
    useAppStore.setState({ activeFileId: "note.md", content: "keep" });
    const { result } = renderHook(() => useEditor());
    await waitFor(() => expect(result.current.content).toBe("keep"));

    act(() => useAppStore.setState({ activeFileId: null }));
    await waitFor(() => expect(result.current.content).toBe(""));
  });

  it("marks dirty + saving immediately on change", () => {
    __setAutosaveDebounceForTests(60_000); // never fires during this test
    useAppStore.setState({ activeFileId: "note.md", content: "orig" });
    const { result } = renderHook(() => useEditor());

    act(() => result.current.handleChange("edited"));
    expect(result.current.isDirty).toBe(true);
    expect(result.current.saving).toBe(true);
  });

  it("persists after the debounce and clears the dirty flag", async () => {
    __setAutosaveDebounceForTests(50);
    await opfs.writeFile("note.md", "orig");
    useAppStore.setState({ activeFileId: "note.md" });
    const { result } = renderHook(() => useEditor());
    await waitFor(() => expect(result.current.content).toBe("orig"));

    act(() => result.current.handleChange("edited"));
    expect(result.current.saving).toBe(true);

    await waitFor(() => expect(result.current.saving).toBe(false), {
      timeout: 1500,
    });
    expect(result.current.isDirty).toBe(false);
    expect(await opfs.readFile("note.md")).toBe("edited");
  });

  it("cancels a pending save when the active file changes", async () => {
    __setAutosaveDebounceForTests(60_000); // pending timer must not fire
    await opfs.writeFile("a.md", "a");
    await opfs.writeFile("b.md", "b");
    useAppStore.setState({ activeFileId: "a.md" });
    const { result } = renderHook(() => useEditor());
    await waitFor(() => expect(result.current.content).toBe("a"));

    act(() => result.current.handleChange("a-edited"));
    expect(result.current.isDirty).toBe(true);

    act(() => useAppStore.setState({ activeFileId: "b.md" }));
    await waitFor(() => expect(result.current.content).toBe("b"));

    // The pending save for a.md was cancelled — it stays at its original value.
    expect(await opfs.readFile("a.md")).toBe("a");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it("flush force-saves immediately, bypassing the debounce", async () => {
    __setAutosaveDebounceForTests(60_000);
    await opfs.writeFile("note.md", "orig");
    useAppStore.setState({ activeFileId: "note.md" });
    const { result } = renderHook(() => useEditor());
    await waitFor(() => expect(result.current.content).toBe("orig"));

    act(() => result.current.handleChange("edited"));
    await act(async () => {
      await result.current.flush();
    });

    expect(await opfs.readFile("note.md")).toBe("edited");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.saving).toBe(false);
  });
});
