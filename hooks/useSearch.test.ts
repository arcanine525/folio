import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetOpfs } from "@/__mocks__/opfs";
import { __resetRootForTests, writeFile } from "@/lib/opfs";
import {
  createSearchIndex,
  indexFiles,
  removeIndex,
  searchIndex,
  updateIndex,
  type WorkerInbound,
  type WorkerOutbound,
} from "@/lib/searchIndex";
import { bridgeRemove, bridgeUpdate, setSearchPort } from "@/lib/searchBridge";
import { useSearch } from "@/hooks/useSearch";

/**
 * In-process Worker stand-in: jsdom can't spawn real workers, so this fakes one
 * that runs the actual searchIndex logic on the main thread. It mirrors the
 * real lib/search-worker.ts message contract exactly.
 */
class FakeWorker {
  readonly index = createSearchIndex();
  onmessage: ((e: MessageEvent<WorkerOutbound>) => void) | null = null;
  indexed = false;

  constructor(_url: URL, _opts?: { type: string }) {
    created.push(this);
  }

  postMessage(message: WorkerInbound): void {
    // Reply on a microtask so it behaves like an async message event.
    queueMicrotask(() => {
      switch (message.type) {
        case "index":
          indexFiles(this.index, message.payload);
          this.indexed = true;
          this.onmessage?.({ data: { type: "indexed" } } as MessageEvent<WorkerOutbound>);
          break;
        case "search": {
          const results = searchIndex(this.index, message.payload.query, message.payload.filter);
          this.onmessage?.({ data: { type: "results", payload: results } } as MessageEvent<WorkerOutbound>);
          break;
        }
        case "update":
          updateIndex(this.index, message.payload);
          break;
        case "remove":
          removeIndex(this.index, message.payload);
          break;
      }
    });
  }

  terminate(): void {
    /* no-op */
  }
}

const created: FakeWorker[] = [];

function worker(): FakeWorker {
  const w = created.at(-1);
  if (!w) throw new Error("no worker was created");
  return w;
}

describe("hooks/useSearch", () => {
  beforeEach(async () => {
    created.length = 0;
    setSearchPort(null);
    __resetOpfs();
    await __resetRootForTests();
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSearchPort(null);
  });

  it("indexes all .md files on mount and returns search results", async () => {
    await writeFile("a.md", "standup notes");
    await writeFile("b.md", "retro and planning");

    const { result } = renderHook(() => useSearch());
    await waitFor(() => expect(worker().indexed).toBe(true));

    act(() => result.current.search("standup"));
    await waitFor(() => expect(result.current.results.map((r) => r.path)).toEqual(["a.md"]));
  });

  it("sets loading while a search is debouncing", async () => {
    await writeFile("a.md", "alpha bravo charlie");
    const { result } = renderHook(() => useSearch());
    await waitFor(() => expect(worker().indexed).toBe(true));

    act(() => result.current.search("alpha"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("clears results for a blank query", async () => {
    await writeFile("a.md", "needle");
    const { result } = renderHook(() => useSearch());
    await waitFor(() => expect(worker().indexed).toBe(true));

    act(() => result.current.search("needle"));
    await waitFor(() => expect(result.current.results.length).toBe(1));
    act(() => result.current.search("   "));
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("bridgeUpdate pushes a saved file into the live index", async () => {
    const { result } = renderHook(() => useSearch());
    await waitFor(() => expect(worker().indexed).toBe(true));

    // No match yet for a file the worker never indexed.
    act(() => result.current.search("freshman"));
    await waitFor(() => expect(result.current.results).toEqual([]));

    // Simulate a save via the bridge (as useEditor does after writeFile).
    bridgeUpdate({ path: "new.md", name: "new.md", content: "freshman content" });

    act(() => result.current.search("freshman"));
    await waitFor(() => expect(result.current.results.map((r) => r.path)).toEqual(["new.md"]));
  });

  it("bridgeRemove drops a file from the live index", async () => {
    await writeFile("gone.md", "keepme please");
    const { result } = renderHook(() => useSearch());
    await waitFor(() => expect(worker().indexed).toBe(true));

    act(() => result.current.search("keepme"));
    await waitFor(() => expect(result.current.results.map((r) => r.path)).toEqual(["gone.md"]));

    // Simulate a delete via the bridge (as useFileTree does after deleteFile).
    bridgeRemove("gone.md");
    act(() => result.current.search("keepme"));
    await waitFor(() => expect(result.current.results).toEqual([]));
  });
});
