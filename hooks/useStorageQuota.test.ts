import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetOpfs } from "@/__mocks__/opfs";
import * as opfs from "@/lib/opfs";
import { __resetRootForTests } from "@/lib/opfs";
import { useStorageQuota } from "@/hooks/useStorageQuota";

describe("hooks/useStorageQuota", () => {
  beforeEach(async () => {
    __resetOpfs();
    await __resetRootForTests();
  });

  it("flags over when usage / quota exceeds 0.8", async () => {
    vi.spyOn(navigator.storage, "estimate").mockResolvedValue({
      usage: 900,
      quota: 1000,
    });
    const { result } = renderHook(() => useStorageQuota());
    await waitFor(() => expect(result.current.over).toBe(true));
    expect(result.current.showBanner).toBe(true);
  });

  it("stays under the threshold with low usage", async () => {
    vi.spyOn(navigator.storage, "estimate").mockResolvedValue({
      usage: 100,
      quota: 1000,
    });
    const { result } = renderHook(() => useStorageQuota());
    await waitFor(() => expect(result.current.over).toBe(false));
    expect(result.current.showBanner).toBe(false);
  });

  it("dismiss hides the banner but keeps over true", async () => {
    vi.spyOn(navigator.storage, "estimate").mockResolvedValue({
      usage: 900,
      quota: 1000,
    });
    const { result } = renderHook(() => useStorageQuota());
    await waitFor(() => expect(result.current.showBanner).toBe(true));

    act(() => result.current.dismiss());
    expect(result.current.showBanner).toBe(false);
    expect(result.current.over).toBe(true);
  });

  it("re-checks after an OPFS write", async () => {
    let usage = 0;
    vi.spyOn(navigator.storage, "estimate").mockImplementation(async () => ({
      usage,
      quota: 1000,
    }));
    const { result } = renderHook(() => useStorageQuota());
    await waitFor(() => expect(result.current.over).toBe(false));

    usage = 950;
    await act(async () => {
      await opfs.writeFile("note.md", "x");
    });
    await waitFor(() => expect(result.current.over).toBe(true));
  });
});
