import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal, testConnection } from "@/components/settings/SettingsModal";
import { useSettingsStore, __resetForTests } from "@/store/settingsStore";

function renderOpen() {
  render(<SettingsModal open={true} onClose={vi.fn()} />);
}

describe("SettingsModal", () => {
  beforeEach(() => __resetForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<SettingsModal open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a radio card per default provider", () => {
    renderOpen();
    expect(screen.getByText("Folio Cloud (default)")).toBeInTheDocument();
    expect(screen.getByText("Anthropic (your key)")).toBeInTheDocument();
    expect(screen.getByText("OpenAI (your key)")).toBeInTheDocument();
    expect(screen.getByText("Local — Ollama")).toBeInTheDocument();
  });

  it("selecting a provider card swaps the configuration fields", async () => {
    const user = userEvent.setup();
    renderOpen();
    // Default active = proxy → base URL disabled.
    expect(screen.getByLabelText("Base URL")).toBeDisabled();

    // Switch to Anthropic (byok) → fields become editable + its model shows.
    await user.click(screen.getByText("Anthropic (your key)"));
    expect(screen.getByLabelText("Base URL")).not.toBeDisabled();
    expect(screen.getByLabelText("Model")).toHaveValue("claude-sonnet-4-6");

    // Switch to OpenAI → model value changes to gpt-4o-mini.
    await user.click(screen.getByText("OpenAI (your key)"));
    expect(screen.getByLabelText("Model")).toHaveValue("gpt-4o-mini");
  });

  it("hides the API key field for the proxy (cloud) provider", () => {
    renderOpen();
    // Proxy is active by default.
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
  });

  it("shows the API key field for a byok provider", async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByText("Anthropic (your key)"));
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("required")).toBeInTheDocument();
  });

  it("+ Add local spawns a new editable local card and selects it", async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByText("+ Add local"));
    // A remove button only appears for the active local provider.
    expect(screen.getByText("Remove this provider")).toBeInTheDocument();
    // Local providers default to the Ollama model + openai dialect.
    expect(screen.getByLabelText("Model")).toHaveValue("llama3.1:8b");
  });

  it("Save persists the draft (active provider + edited model) to the store", async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByText("OpenAI (your key)"));
    await user.clear(screen.getByLabelText("Model"));
    await user.type(screen.getByLabelText("Model"), "gpt-4o");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const active = useSettingsStore.getState().getActive();
    expect(active?.id).toBe("byok-openai");
    expect(active?.model).toBe("gpt-4o");
  });

  it("Cancel discards edits (store unchanged)", async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByText("OpenAI (your key)"));
    await user.clear(screen.getByLabelText("Model"));
    await user.type(screen.getByLabelText("Model"), "gpt-4o");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(useSettingsStore.getState().getActive()?.id).toBe("proxy");
  });
});

describe("testConnection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports success + latency on a 2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const result = await testConnection({
      id: "byok-openai",
      label: "OpenAI",
      mode: "byok",
      dialect: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      maxTokens: 4096,
    });
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Connected");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports the HTTP status on a non-2xx response (e.g. 401)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));
    const result = await testConnection({
      id: "byok-openai",
      label: "OpenAI",
      mode: "byok",
      dialect: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      maxTokens: 4096,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/401/);
  });

  it("reports the error string on a network/CORS failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await testConnection({
      id: "local-ollama",
      label: "Local",
      mode: "local",
      dialect: "openai",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1:8b",
      maxTokens: 4096,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/fetch/i);
  });

  it("sends a non-streaming 1-token probe body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await testConnection({
      id: "byok-openai",
      label: "OpenAI",
      mode: "byok",
      dialect: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      maxTokens: 4096,
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(1);
  });
});
