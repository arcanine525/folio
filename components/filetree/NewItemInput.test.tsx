import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewItemInput } from "@/components/filetree/NewItemInput";

describe("NewItemInput", () => {
  it("auto-focuses on mount", () => {
    render(<NewItemInput onCommit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("commits the trimmed name on Enter", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NewItemInput onCommit={onCommit} onCancel={vi.fn()} />);
    await user.type(screen.getByRole("textbox"), "  standup.md  ");
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledWith("standup.md");
  });

  it("cancels (no commit) on Enter with an empty name", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(<NewItemInput onCommit={onCommit} onCancel={onCancel} />);
    await user.keyboard("{Enter}");
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape without committing", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onCommit = vi.fn();
    render(<NewItemInput onCommit={onCommit} onCancel={onCancel} />);
    await user.type(screen.getByRole("textbox"), "draft");
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("shows the provided placeholder", () => {
    render(
      <NewItemInput
        onCommit={vi.fn()}
        onCancel={vi.fn()}
        placeholder="Folder name…"
      />,
    );
    expect(screen.getByPlaceholderText("Folder name…")).toBeInTheDocument();
  });

  it("pre-fills and selects the default value (rename flow)", () => {
    render(
      <NewItemInput
        onCommit={vi.fn()}
        onCancel={vi.fn()}
        defaultValue="old.md"
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("old.md");
    // Selection covers the whole pre-filled name.
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("old.md".length);
  });
});
