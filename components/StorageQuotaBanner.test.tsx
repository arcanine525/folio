import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StorageQuotaBanner } from "@/components/StorageQuotaBanner";

describe("StorageQuotaBanner", () => {
  it("renders nothing when not visible", () => {
    const { container } = render(
      <StorageQuotaBanner visible={false} onDismiss={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the default message and dismiss button when visible", () => {
    render(<StorageQuotaBanner visible={true} onDismiss={vi.fn()} />);
    expect(
      screen.getByText("Storage 80%+ full. Export vault to free space."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dismiss storage warning" }),
    ).toBeInTheDocument();
  });

  it("calls onDismiss when the dismiss button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<StorageQuotaBanner visible={true} onDismiss={onDismiss} />);
    await user.click(
      screen.getByRole("button", { name: "Dismiss storage warning" }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("uses a custom message when provided", () => {
    render(
      <StorageQuotaBanner
        visible={true}
        onDismiss={vi.fn()}
        message="Custom warning"
      />,
    );
    expect(screen.getByText("Custom warning")).toBeInTheDocument();
  });

  it("applies the error-bg + error text tokens", () => {
    const { container } = render(
      <StorageQuotaBanner visible={true} onDismiss={vi.fn()} />,
    );
    const banner = container.firstElementChild as HTMLElement;
    expect(banner.className).toContain("bg-error-bg");
    expect(banner.querySelector("p")?.className).toContain("text-error");
  });
});
