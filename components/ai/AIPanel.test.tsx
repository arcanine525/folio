import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildContext, streamAI } from "@/lib/ai";
import { PROMPTS, SYSTEM_BASE } from "@/lib/prompts";
import { useAppStore } from "@/store/appStore";
import { useSettingsStore, __resetForTests } from "@/store/settingsStore";
import { AIPanel } from "@/components/ai/AIPanel";
import type { ProviderConfig } from "@/types";

vi.mock("@/lib/ai", () => ({
  buildContext: vi.fn(),
  streamAI: vi.fn(),
}));

async function* tokenStream(deltas: string[], signal?: AbortSignal): AsyncGenerator<string> {
  for (const d of deltas) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    yield d;
  }
}

function setActive(p: ProviderConfig, key?: string) {
  useSettingsStore.setState({
    providers: [p],
    activeProviderId: p.id,
    keys: key ? { [p.id]: key } : {},
  });
}

const PROXY: ProviderConfig = {
  id: "proxy",
  label: "Folio Cloud (default)",
  mode: "proxy",
  dialect: "anthropic",
  baseUrl: "",
  model: "claude-sonnet-4-6",
  maxTokens: 4096,
};
const BYOK: ProviderConfig = {
  id: "byok-anthropic",
  label: "Anthropic (your key)",
  mode: "byok",
  dialect: "anthropic",
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-6",
  maxTokens: 4096,
};

describe("AIPanel", () => {
  beforeEach(() => {
    __resetForTests();
    useAppStore.setState({ activeFileId: "note.md", settingsOpen: false });
    vi.mocked(buildContext).mockReset();
    vi.mocked(streamAI).mockReset();
    vi.mocked(buildContext).mockResolvedValue({
      content: "doc body",
      tokens: 10,
      fileCount: 1,
      overLimit: false,
    });
    vi.mocked(streamAI).mockReturnValue(tokenStream(["Hi"]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders header, scope selector, quick actions, prompt + Summarize, chat, and hint", () => {
    setActive(PROXY);
    render(<AIPanel />);
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument();
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Optional: add focus or constraints…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Summarize/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask a question…")).toBeInTheDocument();
    expect(screen.getByText(/Esc to stop/)).toBeInTheDocument();
  });

  it("shows a 'Configure AI' link and opens settings when a byok provider has no key", async () => {
    const user = userEvent.setup();
    setActive(BYOK); // no key → needsConfig
    render(<AIPanel />);
    const link = screen.getByText("Configure AI →");
    await user.click(link);
    expect(useAppStore.getState().settingsOpen).toBe(true);
  });

  it("Summarize runs with the selected prompt and shows the stream badge", async () => {
    setActive(PROXY);
    render(<AIPanel />);
    await act(async () => {
      screen.getByRole("button", { name: /Summarize/ }).click();
    });

    // buildContext was called for the active file scope.
    expect(buildContext).toHaveBeenCalledWith("file", "note.md");
    // streamAI received the Summary prompt as the system prompt.
    await waitFor(() => {
      expect(streamAI).toHaveBeenCalled();
    });
    const args = vi.mocked(streamAI).mock.calls[0];
    expect(args?.[1]).toBe(PROMPTS["Summary"]);

    // The badge names provider · model · scope · file count.
    await waitFor(() => {
      expect(screen.getByText(/Folio Cloud \(default\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/claude-sonnet-4-6/)).toBeInTheDocument();
    expect(screen.getByText(/1 file/)).toBeInTheDocument();
  });

  it("switching quick action changes the prompt used by Summarize", async () => {
    const user = userEvent.setup();
    setActive(PROXY);
    render(<AIPanel />);
    await user.click(screen.getByText("Action items"));
    await act(async () => {
      screen.getByRole("button", { name: /Summarize/ }).click();
    });
    await waitFor(() => expect(streamAI).toHaveBeenCalled());
    const args = vi.mocked(streamAI).mock.calls[0];
    expect(args?.[1]).toBe(PROMPTS["Action items"]);
  });

  it("chat Enter sends a message with the base system prompt", async () => {
    setActive(PROXY);
    const user = userEvent.setup();
    render(<AIPanel />);
    const input = screen.getByPlaceholderText("Ask a question…");
    await user.type(input, "What is this about?{Enter}");
    await waitFor(() => expect(streamAI).toHaveBeenCalled());
    const args = vi.mocked(streamAI).mock.calls[0];
    expect(args?.[1]).toBe(SYSTEM_BASE);
    // The user message wraps the context + chat text.
    const userMsg = args?.[0][args[0].length - 1];
    expect(userMsg.content).toContain("What is this about?");
    expect(userMsg.content).toContain("doc body");
    // Input cleared after send.
    expect(input).toHaveValue("");
  });

  it("warns before sending an oversized context, then sends on confirm", async () => {
    setActive(PROXY);
    vi.mocked(buildContext).mockResolvedValueOnce({
      content: "x".repeat(10),
      tokens: 120_000,
      fileCount: 50,
      overLimit: true,
    });
    render(<AIPanel />);
    await act(async () => {
      screen.getByRole("button", { name: /Summarize/ }).click();
    });
    // Oversized → warning shown, not sent yet.
    expect(await screen.findByText(/Send anyway/)).toBeInTheDocument();
    expect(streamAI).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByText("Send anyway").click();
    });
    await waitFor(() => expect(streamAI).toHaveBeenCalled());
  });

  it("shows a clear-conversation control after a run", async () => {
    setActive(PROXY);
    render(<AIPanel />);
    expect(screen.queryByLabelText("Clear conversation")).not.toBeInTheDocument();
    await act(async () => {
      screen.getByRole("button", { name: /Summarize/ }).click();
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Clear conversation")).toBeInTheDocument(),
    );
  });
});
