import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchModal } from "@/components/search/SearchModal";
import { useAppStore } from "@/store/appStore";
import type { SearchResult } from "@/lib/searchIndex";

const RESULTS: SearchResult[] = [
  { path: "meetings/standup.md", name: "standup.md", excerpt: "daily standup notes" },
  { path: "projects/roadmap.md", name: "roadmap.md", excerpt: "the project plan" },
  { path: "scratch.md", name: "scratch.md", excerpt: "random ideas" },
];

function open() {
  act(() => useAppStore.getState().openSearch(""));
}

function close() {
  act(() => useAppStore.setState({ searchOpen: false }));
}

describe("components/search/SearchModal", () => {
  beforeEach(() => {
    useAppStore.setState({ searchOpen: false, searchInitialQuery: "", activeFileId: null });
  });
  afterEach(() => close());

  it("renders nothing while closed", () => {
    render(<SearchModal results={[]} loading={false} onSearch={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the input, filter tabs, and footer when open", () => {
    open();
    render(<SearchModal results={[]} loading={false} onSearch={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search files…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Meetings" })).toBeInTheDocument();
    expect(screen.getByText("navigate")).toBeInTheDocument();
  });

  it("drives a debounced search as the user types", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    open();
    render(<SearchModal results={[]} loading={false} onSearch={onSearch} />);
    await user.type(screen.getByPlaceholderText("Search files…"), "x");
    expect(onSearch).toHaveBeenCalledWith("x", undefined);
  });

  it("parses a #tag query into a tag filter", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    open();
    render(<SearchModal results={[]} loading={false} onSearch={onSearch} />);
    await user.type(screen.getByPlaceholderText("Search files…"), "#meeting");
    expect(onSearch).toHaveBeenCalledWith("meeting", { tag: "meeting" });
  });

  it("shows all results in the All tab", () => {
    open();
    render(<SearchModal results={RESULTS} loading={false} onSearch={vi.fn()} />);
    expect(screen.getByText("3 results")).toBeInTheDocument();
    expect(screen.getByText("standup.md")).toBeInTheDocument();
    expect(screen.getByText("roadmap.md")).toBeInTheDocument();
  });

  it("narrows results by the Meetings tab (path match)", () => {
    open();
    render(<SearchModal results={RESULTS} loading={false} onSearch={vi.fn()} />);
    act(() => {
      screen.getByRole("button", { name: "Meetings" }).click();
    });
    expect(screen.getByText("1 result")).toBeInTheDocument();
    expect(screen.getByText("standup.md")).toBeInTheDocument();
    expect(screen.queryByText("roadmap.md")).toBeNull();
  });

  it("shows the folder path and excerpt on each row", () => {
    open();
    render(<SearchModal results={RESULTS} loading={false} onSearch={vi.fn()} />);
    expect(screen.getByText("meetings")).toBeInTheDocument();
    expect(screen.getByText("daily standup notes")).toBeInTheDocument();
  });

  it("selects a result: closes the modal and sets the active file", async () => {
    const user = userEvent.setup();
    open();
    render(<SearchModal results={RESULTS} loading={false} onSearch={vi.fn()} />);
    await user.click(screen.getByText("roadmap.md"));
    expect(useAppStore.getState().activeFileId).toBe("projects/roadmap.md");
    expect(useAppStore.getState().searchOpen).toBe(false);
  });

  it("navigates with arrow keys and opens the active result on Enter", async () => {
    const user = userEvent.setup();
    open();
    render(<SearchModal results={RESULTS} loading={false} onSearch={vi.fn()} />);
    const input = screen.getByPlaceholderText("Search files…");
    await user.type(input, "{ArrowDown}"); // active → index 1 (roadmap)
    await user.type(input, "{Enter}");
    expect(useAppStore.getState().activeFileId).toBe("projects/roadmap.md");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    open();
    render(<SearchModal results={[]} loading={false} onSearch={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("Search files…"), "{Escape}");
    expect(useAppStore.getState().searchOpen).toBe(false);
  });

  it("closes on backdrop click", async () => {
    const user = userEvent.setup();
    open();
    render(<SearchModal results={[]} loading={false} onSearch={vi.fn()} />);
    await user.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(useAppStore.getState().searchOpen).toBe(false);
  });
});
