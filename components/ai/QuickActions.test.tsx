import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PROMPT_KEYS } from "@/lib/prompts";
import { QuickActions } from "@/components/ai/QuickActions";

describe("QuickActions", () => {
  it("renders all six chips in the canonical order", () => {
    render(<QuickActions selected={null} onSelect={vi.fn()} />);
    const chips = screen.getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(PROMPT_KEYS);
    expect(PROMPT_KEYS).toEqual([
      "Action items",
      "Decisions",
      "Questions",
      "Timeline",
      "Summary",
      "Next steps",
    ]);
  });

  it("highlights only the selected chip with the accent treatment", () => {
    render(<QuickActions selected="Summary" onSelect={vi.fn()} />);
    const active = screen.getByRole("button", { name: "Summary" });
    const inactive = screen.getByRole("button", { name: "Timeline" });
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(active.className).toMatch(/bg-accent-light/);
    expect(active.className).toMatch(/text-accent/);
    expect(inactive).toHaveAttribute("aria-pressed", "false");
    expect(inactive.className).not.toMatch(/bg-accent-light/);
  });

  it("applies the chip base styling (border, surface bg, caption font)", () => {
    render(<QuickActions selected={null} onSelect={vi.fn()} />);
    const chip = screen.getByRole("button", { name: "Decisions" });
    expect(chip.className).toMatch(/border/);
    expect(chip.className).toMatch(/bg-surface-secondary/);
    expect(chip.className).toMatch(/font-caption/);
  });

  it("calls onSelect with the clicked chip's key", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<QuickActions selected={null} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Action items" }));
    expect(onSelect).toHaveBeenCalledWith("Action items");
  });
});
