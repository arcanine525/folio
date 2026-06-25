import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileTreeItem } from "@/components/filetree/FileTreeItem";
import type { FSNode } from "@/types";

const file = (over: Partial<FSNode> = {}): FSNode => ({
  type: "file",
  name: "note.md",
  path: "note.md",
  ...over,
});
const folder = (over: Partial<FSNode> = {}): FSNode => ({
  type: "folder",
  name: "docs",
  path: "docs",
  children: [],
  ...over,
});

describe("FileTreeItem", () => {
  it("renders a non-active file with secondary label styling", () => {
    render(<FileTreeItem node={file()} depth={0} />);
    const row = screen.getByRole("button");
    expect(row).not.toHaveAttribute("aria-current", "true");
    expect(row.className).not.toContain("bg-accent-light");
    expect(screen.getByText("note.md").className).toContain("text-fg-secondary");
  });

  it("renders an active file with accent bg + aria-current", () => {
    render(<FileTreeItem node={file()} depth={0} active />);
    const row = screen.getByRole("button");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(row.className).toContain("bg-accent-light");
    expect(screen.getByText("note.md").className).toContain("text-accent");
  });

  it("renders a folder with heading/medium/primary styling", () => {
    render(<FileTreeItem node={folder()} depth={0} />);
    const label = screen.getByText("docs");
    expect(label.className).toContain("font-medium");
    expect(label.className).toContain("text-fg-primary");
  });

  it("indents the row by depth * 14px (+ 8px base)", () => {
    render(<FileTreeItem node={file()} depth={2} />);
    expect(screen.getByRole("button")).toHaveStyle({ paddingLeft: "36px" });
  });

  it("fires onActivate on left-click of a file", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<FileTreeItem node={file()} depth={0} onActivate={onActivate} />);
    await user.click(screen.getByRole("button"));
    expect(onActivate).toHaveBeenCalledWith(file());
  });

  it("fires onToggleExpand on left-click of a folder", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    render(<FileTreeItem node={folder()} depth={0} onToggleExpand={onToggleExpand} />);
    await user.click(screen.getByText("docs"));
    expect(onToggleExpand).toHaveBeenCalledWith(folder());
  });

  it("shows the unsaved dot only when dirty", () => {
    const { rerender } = render(<FileTreeItem node={file()} depth={0} dirty />);
    expect(screen.getByLabelText("unsaved changes")).toBeInTheDocument();
    rerender(<FileTreeItem node={file()} depth={0} />);
    expect(screen.queryByLabelText("unsaved changes")).not.toBeInTheDocument();
  });

  it("opens a four-action context menu on right-click", () => {
    render(<FileTreeItem node={file()} depth={0} />);
    fireEvent.contextMenu(screen.getByRole("button"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "New file here" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "New folder here" })).toBeInTheDocument();
  });

  it("fires the matching callback and closes when a menu item is chosen", () => {
    const onRename = vi.fn();
    render(<FileTreeItem node={file()} depth={0} onRename={onRename} />);
    fireEvent.contextMenu(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(onRename).toHaveBeenCalledWith(file());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the context menu on Escape", () => {
    render(<FileTreeItem node={file()} depth={0} />);
    fireEvent.contextMenu(screen.getByRole("button"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the context menu on outside click", () => {
    render(<FileTreeItem node={file()} depth={0} />);
    fireEvent.contextMenu(screen.getByRole("button"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
