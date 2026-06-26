import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetIndexedDbForTests } from "@/__mocks__/indexeddb";
import { streamAI } from "@/lib/ai";
import { __resetDbForTests, getCache } from "@/lib/indexeddb";
import { useSettingsStore, __resetForTests } from "@/store/settingsStore";
import { useAI } from "@/hooks/useAI";
import type { AIMessage, ProviderConfig } from "@/types";

vi.mock("@/lib/ai", () => ({
  streamAI: vi.fn(),
}));

function provider(partial: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: "byok-test",
    label: "Test",
    mode: "byok",
    dialect: "anthropic",
    baseUrl: "https://example.com",
    model: "m",
    maxTokens: 1024,
    ...partial,
  };
}

/** Async generator that yields `deltas`, abortable via `signal`. */
async function* tokenStream(deltas: string[], signal?: AbortSignal): AsyncGenerator<string> {
  for (const d of deltas) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    yield d;
  }
}

/** Async generator that yields once, then hangs until `signal` aborts. */
async function* abortableHang(signal?: AbortSignal): AsyncGenerator<string> {
  yield "a";
  await new Promise<void>((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
}

function setActive(p: ProviderConfig | null, key?: string) {
  const providers = p ? [p] : [];
  const keys = p && key ? { [p.id]: key } : {};
  useSettingsStore.setState({
    providers,
    activeProviderId: p ? p.id : "missing",
    keys,
  });
}

describe("hooks/useAI", () => {
  beforeEach(() => {
    __resetForTests();
    __resetIndexedDbForTests();
    __resetDbForTests();
    vi.mocked(streamAI).mockReset();
  });

  it("streams tokens into output and records the turn in history", async () => {
    setActive(provider({ mode: "proxy" }));
    vi.mocked(streamAI).mockReturnValue(tokenStream(["Hel", "lo"]));

    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.run("summarize", "sys", "the document");
    });

    expect(result.current.output).toBe("Hello");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.history).toHaveLength(2);
    const [user, assistant] = result.current.history as AIMessage[];
    expect(user.role).toBe("user");
    expect(user.content).toContain("<document>");
    expect(user.content).toContain("the document");
    expect(user.content.endsWith("summarize")).toBe(true);
    expect(assistant).toEqual({ role: "assistant", content: "Hello" });
  });

  it("errors when no provider is configured", async () => {
    setActive(null);
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.run("hi", "sys", "ctx");
    });
    expect(result.current.error).toMatch(/no ai provider/i);
    expect(result.current.loading).toBe(false);
    expect(streamAI).not.toHaveBeenCalled();
  });

  it("errors when a byok provider has no key", async () => {
    setActive(provider({ mode: "byok" })); // no key
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.run("hi", "sys", "ctx");
    });
    expect(result.current.error).toMatch(/api key/i);
    expect(streamAI).not.toHaveBeenCalled();
  });

  it("lets a byok provider through when a key is present", async () => {
    setActive(provider({ mode: "byok" }), "sk-1");
    vi.mocked(streamAI).mockReturnValue(tokenStream(["ok"]));
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.run("hi", "sys", "ctx");
    });
    expect(result.current.output).toBe("ok");
    expect(result.current.error).toBeNull();
  });

  it("stop() aborts the in-flight stream, clears loading, sets no error", async () => {
    setActive(provider({ mode: "proxy" }));
    vi.mocked(streamAI).mockImplementation(
      ((_m, _s, _p, _k, signal) => abortableHang(signal)) as typeof streamAI,
    );

    const { result } = renderHook(() => useAI());
    act(() => {
      void result.current.run("hi", "sys", "ctx");
    });
    await waitFor(() => expect(result.current.output).toBe("a"));
    expect(result.current.loading).toBe(true);

    act(() => result.current.stop());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    // An aborted run must not append a completed turn to history.
    expect(result.current.history).toHaveLength(0);
  });

  it("clearHistory empties the conversation", async () => {
    setActive(provider({ mode: "proxy" }));
    vi.mocked(streamAI).mockReturnValue(tokenStream(["x"]));
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.run("hi", "sys", "ctx");
    });
    expect(result.current.history).toHaveLength(2);
    act(() => result.current.clearHistory());
    expect(result.current.history).toHaveLength(0);
  });

  it("caches a response and replays it on a second identical run (no provider call)", async () => {
    setActive(provider({ mode: "proxy" }));
    vi.mocked(streamAI).mockReturnValue(tokenStream(["World"]));

    const { result } = renderHook(() => useAI());

    // First run: cache miss → provider streams "World" → stored in cache.
    await act(async () => {
      await result.current.run("hi", "sys", "ctx");
    });
    expect(result.current.output).toBe("World");
    expect(streamAI).toHaveBeenCalledTimes(1);

    // Second identical run: cache hit → replayed synthetically, no provider call.
    await act(async () => {
      await result.current.run("hi", "sys", "ctx");
    });
    expect(result.current.output).toBe("World");
    expect(streamAI).toHaveBeenCalledTimes(1); // still once

    // The cached entry exists in the store.
    const cached = await getCache(
      await (await import("@/lib/cacheKey")).computeCacheKey("ctx", "sys", "hi"),
    );
    expect(cached?.response).toBe("World");
  });

  it("misses the cache and calls the provider when an input differs", async () => {
    setActive(provider({ mode: "proxy" }));
    vi.mocked(streamAI).mockReturnValue(tokenStream(["World"]));

    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.run("hi", "sys", "ctx"); // primes the cache
    });

    vi.mocked(streamAI).mockReturnValue(tokenStream(["Other"]));
    await act(async () => {
      await result.current.run("changed", "sys", "ctx"); // different user message
    });
    expect(result.current.output).toBe("Other");
    expect(streamAI).toHaveBeenCalledTimes(2);
  });
});
