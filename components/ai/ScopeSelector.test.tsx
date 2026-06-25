import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScopeSelector } from "@/components/ai/ScopeSelector";

describe("ScopeSelector", () => {
  it("renders the three scope pills", () => {
    render(<ScopeSelector value="file" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });

  it("marks only the active scope as pressed", () => {
    render(<ScopeSelector value="folder" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Folder" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "File" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });

  it("applies the accent fill class to the active pill only", () => {
    render(<ScopeSelector value="all" onChange={vi.fn()} />);
    const active = screen.getByRole("button", { name: "All" });
    const inactive = screen.getByRole("button", { name: "File" });
    expect(active.className).toMatch(/bg-accent/);
    expect(active.className).toMatch(/text-surface-primary/);
    expect(inactive.className).not.toMatch(/bg-accent/);
  });

  it("calls onChange with the clicked scope", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ScopeSelector value="file" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Folder" }));
    expect(onChange).toHaveBeenCalledWith("folder");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
