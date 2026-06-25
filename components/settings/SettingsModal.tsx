"use client";

import { useEffect, useState } from "react";
import { buildRequest } from "@/lib/ai";
import { createLocalProvider, useSettingsStore } from "@/store/settingsStore";
import type { ApiDialect, ProviderConfig } from "@/types";

export interface SettingsModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Close the modal (Esc / backdrop / Cancel). */
  onClose: () => void;
}

interface TestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

const DIALECTS: { value: ApiDialect; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
];

/** True when the user can edit a provider's config fields (cloud cards lock them). */
function isConfigurable(p: ProviderConfig): boolean {
  return p.mode !== "proxy";
}

/** True when the provider accepts an API key field. */
function hasKeyField(p: ProviderConfig): boolean {
  return p.mode === "byok" || p.mode === "local";
}

/**
 * AI provider settings modal. Renders radio cards for every provider, lets the
 * user edit configuration (dialect, base URL, model, max tokens) and keys, test
 * the connection, then Save persists to the settings store. Cloud (`proxy`)
 * cards lock config and hide the key field. Custom local servers can be added
 * with `+ Add local` and get a uuid id.
 *
 * Controlled (`open`/`onClose`); the open state lives in the app store so the
 * ⌘, shortcut, the ⚙ button, and the AI panel's "Configure AI" link can open it.
 */
export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const providers = useSettingsStore((s) => s.providers);
  const activeProviderId = useSettingsStore((s) => s.activeProviderId);
  const keys = useSettingsStore((s) => s.keys);
  const replaceSettings = useSettingsStore((s) => s.replaceSettings);

  const [draftProviders, setDraftProviders] = useState<ProviderConfig[]>([]);
  const [draftActive, setDraftActive] = useState("");
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});

  // Seed the draft from the store whenever the modal opens. Adjusting state
  // during render (the documented "reset when a prop changes" pattern) avoids
  // the cascading renders a setState-in-effect would cause. prevOpen starts
  // false so a modal mounted already-open also seeds on its first render.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraftProviders(providers.map((p) => ({ ...p })));
      setDraftActive(activeProviderId);
      setDraftKeys({ ...keys });
      setShowKey(false);
      setResults({});
    }
  }

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const active = draftProviders.find((p) => p.id === draftActive);

  const updateProvider = (id: string, patch: Partial<ProviderConfig>) =>
    setDraftProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addLocal = () => {
    const p = createLocalProvider();
    setDraftProviders((prev) => [...prev, p]);
    setDraftActive(p.id);
  };

  const removeProvider = (id: string) => {
    setDraftProviders((prev) => prev.filter((p) => p.id !== id));
    setDraftKeys((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (draftActive === id && draftProviders.length > 1) {
      setDraftActive(draftProviders.find((p) => p.id !== id)?.id ?? "");
    }
  };

  const runTest = async (p: ProviderConfig) => {
    setTestingId(p.id);
    try {
      const result = await testConnection(p, draftKeys[p.id]);
      setResults((prev) => ({ ...prev, [p.id]: result }));
    } finally {
      setTestingId(null);
    }
  };

  const handleSave = () => {
    replaceSettings({
      activeProviderId: draftActive,
      providers: draftProviders,
      keys: draftKeys,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="AI settings"
    >
      <div
        className="flex max-h-[85vh] w-[520px] flex-col overflow-hidden rounded-modal bg-surface-primary shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-heading text-sm font-semibold text-fg-primary">AI Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="font-sans text-fg-muted hover:text-fg-primary"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* PROVIDER */}
          <p className="font-caption text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
            Provider
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {draftProviders.map((p) => {
              const selected = p.id === draftActive;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDraftActive(p.id)}
                  aria-pressed={selected}
                  className={`flex items-center gap-2 rounded-card border px-3 py-2 text-left transition-colors ${
                    selected
                      ? "border-accent border-2 bg-accent-light"
                      : "border-border hover:bg-surface-secondary"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                      selected ? "border-accent" : "border-border"
                    }`}
                  >
                    {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  </span>
                  <span className="flex-1">
                    <span className="font-heading block text-[13px] font-semibold text-fg-primary">
                      {p.label}
                    </span>
                    <span className="font-caption block text-[11px] text-fg-muted">
                      {p.mode} · {p.dialect}
                    </span>
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={addLocal}
              className="font-caption mt-1 self-start text-[11px] text-accent hover:underline"
            >
              + Add local
            </button>
          </div>

          {/* CONFIGURATION for the active provider */}
          {active && (
            <div className="mt-5">
              <p className="font-caption text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                Configuration
              </p>

              {/* Dialect */}
              <Field label="Dialect">
                <div className="flex gap-1.5">
                  {DIALECTS.map((d) => {
                    const on = active.dialect === d.value;
                    return (
                      <button
                        key={d.value}
                        type="button"
                        disabled={!isConfigurable(active)}
                        onClick={() => updateProvider(active.id, { dialect: d.value })}
                        aria-pressed={on}
                        className={`rounded-chip border px-2 py-1 font-caption text-[11px] transition-colors disabled:opacity-50 ${
                          on
                            ? "border-transparent bg-accent-light text-accent"
                            : "border-border text-fg-secondary"
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Base URL">
                <input
                  type="text"
                  value={active.baseUrl}
                  disabled={!isConfigurable(active)}
                  onChange={(e) => updateProvider(active.id, { baseUrl: e.target.value })}
                  className="font-mono w-full rounded-input border border-border bg-surface-secondary px-2 py-1 text-xs text-fg-primary disabled:opacity-60"
                />
              </Field>

              <div className="flex gap-3">
                <Field label="Model" className="flex-1">
                  <input
                    type="text"
                    value={active.model}
                    disabled={!isConfigurable(active)}
                    onChange={(e) => updateProvider(active.id, { model: e.target.value })}
                    className="font-mono w-full rounded-input border border-border bg-surface-secondary px-2 py-1 text-xs text-fg-primary disabled:opacity-60"
                  />
                </Field>
                <Field label="Max tokens" className="w-28">
                  <input
                    type="number"
                    value={active.maxTokens}
                    disabled={!isConfigurable(active)}
                    onChange={(e) =>
                      updateProvider(active.id, {
                        maxTokens: Number(e.target.value) || 0,
                      })
                    }
                    className="font-mono w-full rounded-input border border-border bg-surface-secondary px-2 py-1 text-xs text-fg-primary disabled:opacity-60"
                  />
                </Field>
              </div>

              {active.mode === "proxy" && (
                <p className="font-caption mt-1 text-[11px] text-fg-muted">
                  Cloud proxy uses Folio&apos;s server key — no configuration needed.
                </p>
              )}

              {/* API KEY */}
              {hasKeyField(active) && (
                <div className="mt-3">
                  <label
                    htmlFor={`key-${active.id}`}
                    className="font-caption mb-1 block text-[11px] text-fg-secondary"
                  >
                    API key
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`key-${active.id}`}
                      type={showKey ? "text" : "password"}
                      value={draftKeys[active.id] ?? ""}
                      onChange={(e) =>
                        setDraftKeys((prev) => ({ ...prev, [active.id]: e.target.value }))
                      }
                      placeholder={active.mode === "local" ? "optional" : "required"}
                      className="font-mono flex-1 rounded-input border border-border bg-surface-secondary px-2 py-1 text-xs text-fg-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="font-caption rounded-chip border border-border px-2 py-1 text-[11px] text-fg-secondary hover:text-fg-primary"
                    >
                      {showKey ? "Hide" : "Show"}
                    </button>
                  </div>
                  <p className="font-caption mt-1 text-[11px] text-fg-muted">
                    Stored in your browser (localStorage).
                  </p>
                </div>
              )}

              {/* Test connection */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => runTest(active)}
                  disabled={testingId === active.id}
                  className="font-caption rounded-input border border-border px-2.5 py-1 text-[11px] text-fg-secondary hover:text-fg-primary disabled:opacity-50"
                >
                  {testingId === active.id ? "Testing…" : "Test connection"}
                </button>
                {results[active.id] && (
                  <span
                    className={`font-caption text-[11px] ${
                      results[active.id].ok ? "text-success" : "text-error"
                    }`}
                  >
                    {results[active.id].ok ? "✓ " : "⚠ "}
                    {results[active.id].message}
                    {results[active.id].latencyMs != null
                      ? ` · ${results[active.id].latencyMs}ms`
                      : ""}
                  </span>
                )}
              </div>

              {/* Local CORS hint */}
              {active.mode === "local" && (
                <p className="font-caption mt-2 text-[11px] text-fg-muted">
                  Connection failing? Ensure CORS allows browser access: set{" "}
                  <code className="font-mono">OLLAMA_ORIGINS</code> for Ollama, or enable the
                  CORS toggle in LM Studio.
                </p>
              )}

              {/* Remove custom local provider */}
              {active.mode === "local" && (
                <button
                  type="button"
                  onClick={() => removeProvider(active.id)}
                  className="font-caption mt-3 text-[11px] text-error hover:underline"
                >
                  Remove this provider
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="font-heading rounded-input border border-border px-3 py-1.5 text-[13px] font-medium text-fg-secondary hover:text-fg-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="font-heading rounded-input bg-accent px-3 py-1.5 text-[13px] font-semibold text-surface-primary"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`mt-3 block ${className}`}>
      <span className="font-caption mb-1 block text-[11px] text-fg-secondary">{label}</span>
      {children}
    </label>
  );
}

/**
 * 1-token non-streaming probe to the configured endpoint. Reports latency on
 * success or the error string (catches 401 / CORS / wrong base URL). For `proxy`
 * mode it pings Folio's route; the server key is never in the browser.
 */
export async function testConnection(
  provider: ProviderConfig,
  apiKey?: string,
): Promise<TestResult> {
  const start = nowMs();
  try {
    let res: Response;
    if (provider.mode === "proxy") {
      res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "ping" }],
          system: "",
        }),
      });
    } else {
      const base = buildRequest(
        provider,
        apiKey,
        [{ role: "user", content: "ping" }],
        "",
      );
      const body = JSON.parse(base.body) as Record<string, unknown>;
      body.stream = false;
      body.max_tokens = 1;
      res = await fetch(base.url, {
        method: "POST",
        headers: base.headers,
        body: JSON.stringify(body),
      });
    }
    const latencyMs = Math.round(nowMs() - start);
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}`, latencyMs };
    }
    return { ok: true, message: "Connected", latencyMs };
  } catch (e) {
    const latencyMs = Math.round(nowMs() - start);
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      latencyMs,
    };
  }
}

/** performance.now() with a jsdom-safe fallback. */
function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
