import { type MutableRefObject } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { EditorView } from "@codemirror/view";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { useAppStore } from "@/store/appStore";

const viewRef = { current: null } as MutableRefObject<EditorView | null>;

function resetSearchState() {
  useAppStore.setState({ searchOpen: false, searchInitialQuery: "" });
}

describe("components/editor/EditorToolbar", () => {
  beforeEach(() => resetSearchState());

  it("renders the format buttons and view modes without crashing", () => {
    render(<EditorToolbar content="# Hi" viewRef={viewRef} />);
    expect(screen.getByTitle("Bold")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "split" })).toBeInTheDocument();
  });

  it("renders a pill for each frontmatter tag when an active file is present", () => {
    const content = "---\ntags: [meeting, q3]\n---\n# Body";
    render(<EditorToolbar content={content} viewRef={viewRef} wordCount={2} />);
    expect(screen.getByTitle("Search for #meeting")).toBeInTheDocument();
    expect(screen.getByTitle("Search for #q3")).toBeInTheDocument();
  });

  it("hides tag pills for the welcome doc (no active file → no wordCount)", () => {
    const content = "---\ntags: [meeting]\n---\n# Welcome";
    render(<EditorToolbar content={content} viewRef={viewRef} />);
    expect(screen.queryByTitle(/Search for #/)).toBeNull();
  });

  it("clicking a tag opens search pre-filtered to that tag", async () => {
    const user = userEvent.setup();
    const content = "---\ntags: [meeting]\n---\n# Body";
    render(<EditorToolbar content={content} viewRef={viewRef} wordCount={1} />);

    await user.click(screen.getByTitle("Search for #meeting"));

    const { searchOpen, searchInitialQuery } = useAppStore.getState();
    expect(searchOpen).toBe(true);
    expect(searchInitialQuery).toBe("#meeting");
  });

  it("renders the accent pill styling", () => {
    const content = "---\ntags: [x]\n---\n";
    render(<EditorToolbar content={content} viewRef={viewRef} wordCount={0} />);
    const pill = screen.getByTitle("Search for #x");
    expect(pill.className).toMatch(/bg-accent-light/);
    expect(pill.className).toMatch(/text-accent/);
    expect(pill.className).toMatch(/font-caption/);
  });
});
