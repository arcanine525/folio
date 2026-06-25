import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AIStream } from "@/components/ai/AIStream";

describe("AIStream", () => {
  it("shows the thinking pulse before the first token arrives", () => {
    render(<AIStream content="" loading={true} />);
    expect(screen.getByLabelText("AI is thinking")).toBeInTheDocument();
    // Three pulse dots.
    expect(screen.getByLabelText("AI is thinking").querySelectorAll("span").length).toBe(3);
  });

  it("hides the pulse once content has arrived (even while still loading)", () => {
    render(<AIStream content="partial…" loading={true} />);
    expect(screen.queryByLabelText("AI is thinking")).not.toBeInTheDocument();
  });

  it("renders nothing when idle with no content", () => {
    const { container } = render(<AIStream content="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders markdown content into the prose area after the debounce", async () => {
    render(<AIStream content="# Heading" />);
    await waitFor(() => expect(screen.getByText("Heading")).toBeInTheDocument(), {
      timeout: 1500,
    });
  });

  it("strips <script> tags from the rendered output", async () => {
    const malicious = '<script>alert(1)</script>\n\n# Safe';
    render(<AIStream content={malicious} />);
    await waitFor(() => expect(screen.getByText("Safe")).toBeInTheDocument(), {
      timeout: 1500,
    });
    // The prose container must not contain a script element.
    expect(document.querySelector("script")).toBeNull();
  });
});
