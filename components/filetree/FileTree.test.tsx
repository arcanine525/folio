import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileTree } from "@/components/filetree/FileTree";
import type { FSNode } from "@/types";

const nested: FSNode[] = [
  {
    type: "folder",
    name: "docs",
    path: "docs",
    children: [{ type: "file", name: "readme.md", path: "docs/readme.md" }],
  },
  { type: "file", name: "root.md", path: "root.md" },
];

describe("FileTree", () => {
  it("renders nested nodes", () => {
    render(<FileTree nodes={nested} />);
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    expect(screen.getByText("root.md")).toBeInTheDocument();
  });

  it("indents children one level deeper than their parent", () => {
    render(<FileTree nodes={nested} />);
    // depth 0 → 8px, depth 1 → 8 + 14 = 22px
    expect(screen.getByRole("button", { name: "docs" })).toHaveStyle({
      paddingLeft: "8px",
    });
    expect(screen.getByRole("button", { name: "readme.md" })).toHaveStyle({
      paddingLeft: "22px",
    });
  });

  it("keeps folders rendered ahead of files", () => {
    const mixed: FSNode[] = [
      { type: "file", name: "z.md", path: "z.md" },
      { type: "folder", name: "a", path: "a", children: [] },
    ];
    render(<FileTree nodes={mixed} />);
    const labels = screen.getAllByRole("button").map((el) => el.textContent);
    expect(labels).toEqual(["a", "z.md"]);
  });

  it("expands folders by default and collapses on click", async () => {
    const user = userEvent.setup();
    render(<FileTree nodes={nested} />);
    // Child visible while expanded.
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    await user.click(screen.getByText("docs"));
    expect(screen.queryByText("readme.md")).not.toBeInTheDocument();
  });

  it("re-expands a collapsed folder on a second click", async () => {
    const user = userEvent.setup();
    render(<FileTree nodes={nested} />);
    await user.click(screen.getByText("docs")); // collapse
    expect(screen.queryByText("readme.md")).not.toBeInTheDocument();
    await user.click(screen.getByText("docs")); // expand
    expect(screen.getByText("readme.md")).toBeInTheDocument();
  });

  it("forwards onActivate to a child file", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<FileTree nodes={nested} onActivate={onActivate} />);
    await user.click(screen.getByText("readme.md"));
    expect(onActivate).toHaveBeenCalledWith({
      type: "file",
      name: "readme.md",
      path: "docs/readme.md",
    });
  });

  it("forwards context-menu actions to the right node", () => {
    const onDelete = vi.fn();
    render(<FileTree nodes={nested} onDelete={onDelete} />);
    fireEvent.contextMenu(screen.getByText("readme.md"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith({
      type: "file",
      name: "readme.md",
      path: "docs/readme.md",
    });
  });
});
