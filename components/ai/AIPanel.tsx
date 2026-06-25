"use client";

import { useCallback, useEffect, useState } from "react";
import { ScopeSelector } from "@/components/ai/ScopeSelector";
import { QuickActions } from "@/components/ai/QuickActions";
import { AIStream } from "@/components/ai/AIStream";
import { useAI } from "@/hooks/useAI";
import { buildContext } from "@/lib/ai";
import { PROMPTS, SYSTEM_BASE } from "@/lib/prompts";
import { useAppStore } from "@/store/appStore";
import { useSettingsStore } from "@/store/settingsStore";
import type { AIScope } from "@/types";

interface RunMeta {
  providerLabel: string;
  model: string;
  scope: AIScope;
  fileCount: number;
}

interface PendingSend {
  userMessage: string;
  systemPrompt: string;
  content: string;
  tokens: number;
}

/**
 * Right-hand AI panel: scope selector, quick actions, an optional focus prompt +
 * ⚡ Summarize, a stream badge naming the active provider/model/scope/file count,
 * the streamed output, and a chat input. Escape stops a run; Enter sends.
 *
 * Pulls context from OPFS via {@link buildContext} for the active scope, warns
 * before sending an oversized context, and surfaces a "Configure AI" link when no
 * provider is set or a byok provider lacks a key.
 */
export function AIPanel() {
  const activeFileId = useAppStore((s) => s.activeFileId);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  const providers = useSettingsStore((s) => s.providers);
  const activeProviderId = useSettingsStore((s) => s.activeProviderId);
  const keys = useSettingsStore((s) => s.keys);
  const provider = providers.find((p) => p.id === activeProviderId);
  const apiKey = provider ? keys[provider.id] : undefined;
  const needsConfig = !provider || (provider.mode === "byok" && !apiKey);

  const { output, loading, error, history, run, stop, clearHistory } = useAI();

  const [scope, setScope] = useState<AIScope>("file");
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>("Summary");
  const [focus, setFocus] = useState("");
  const [chat, setChat] = useState("");
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [pending, setPending] = useState<PendingSend | null>(null);

  // Build context for the current scope, warn on oversized context, then run.
  const trigger = useCallback(
    async (userMessage: string, systemPrompt: string) => {
      const ctx = await buildContext(scope, activeFileId);
      setMeta({
        providerLabel: provider?.label ?? "—",
        model: provider?.model ?? "—",
        scope,
        fileCount: ctx.fileCount,
      });
      if (ctx.overLimit) {
        setPending({ userMessage, systemPrompt, content: ctx.content, tokens: ctx.tokens });
        return;
      }
      await run(userMessage, systemPrompt, ctx.content);
    },
    [scope, activeFileId, provider, run],
  );

  const confirmSend = useCallback(async () => {
    const p = pending;
    setPending(null);
    if (p) await run(p.userMessage, p.systemPrompt, p.content);
  }, [pending, run]);

  const summarize = useCallback(() => {
    if (needsConfig) {
      setSettingsOpen(true);
      return;
    }
    const key = selectedPrompt ?? "Summary";
    void trigger(focus.trim() || key, PROMPTS[key]);
  }, [needsConfig, selectedPrompt, focus, trigger, setSettingsOpen]);

  const sendChat = useCallback(() => {
    const text = chat.trim();
    if (!text || loading) return;
    setChat("");
    void trigger(text, SYSTEM_BASE);
  }, [chat, loading, trigger]);

  // Escape stops the in-flight stream (but not while the settings modal is open,
  // which owns Escape to close itself).
  useEffect(() => {
    if (!loading || settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loading, settingsOpen, stop]);

  const showBadge = loading || output !== "" || history.length > 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-surface-primary">
      {/* Header: title + scope (P3.11.1/2) */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shadow-panel">
        <div className="flex items-center gap-2">
          <span className="font-heading text-[13px] font-semibold text-fg-primary">
            AI Assistant
          </span>
          {history.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              title="Clear conversation"
              aria-label="Clear conversation"
              className="font-caption rounded-chip px-1.5 py-0.5 text-[11px] text-fg-muted hover:bg-surface-secondary hover:text-fg-primary"
            >
              ⟲
            </button>
          )}
        </div>
        <ScopeSelector value={scope} onChange={setScope} />
      </div>

      {/* Quick actions (P3.11.3) */}
      <div className="border-b border-border px-4 py-2">
        <QuickActions selected={selectedPrompt} onSelect={setSelectedPrompt} />
      </div>

      {/* Prompt input + Summarize (P3.11.4/5) */}
      <div className="px-4 pt-3">
        <input
          type="text"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Optional: add focus or constraints…"
          className="font-sans w-full rounded-input border border-border bg-surface-secondary px-2.5 py-1.5 text-xs text-fg-primary placeholder:text-fg-muted"
        />
        <button
          type="button"
          onClick={summarize}
          className="font-heading mt-2 rounded-chip bg-accent px-3 py-1.5 text-xs font-semibold text-surface-primary transition-opacity hover:opacity-90"
        >
          ⚡ Summarize
        </button>
      </div>

      {/* Stream badge / configure / error (P3.11.6/7) */}
      <div className="px-4 pt-2">
        {needsConfig ? (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="font-caption text-[11px] text-accent hover:underline"
          >
            Configure AI →
          </button>
        ) : showBadge && meta ? (
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                loading ? "animate-pulse bg-accent" : "bg-success"
              }`}
            />
            <span className="font-caption text-[11px] text-fg-muted">
              {meta.providerLabel} · {meta.model} · {labelScope(meta.scope)} ·{" "}
              {meta.fileCount} {meta.fileCount === 1 ? "file" : "files"}
            </span>
          </div>
        ) : null}

        {error && (
          <p className="font-caption mt-1 text-[11px] text-error">{error}</p>
        )}
      </div>

      {/* Token-size warning (P3.6.5) */}
      {pending && (
        <div className="absolute inset-x-0 top-20 z-10 mx-auto w-[80%] rounded-card border border-border bg-surface-primary p-3 shadow-modal">
          <p className="font-sans text-xs text-fg-primary">
            Context is large (~{pending.tokens.toLocaleString()} tokens). Sending may be slow
            or costly.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="font-heading rounded-input border border-border px-2.5 py-1 text-[11px] font-medium text-fg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSend}
              className="font-heading rounded-input bg-accent px-2.5 py-1 text-[11px] font-semibold text-surface-primary"
            >
              Send anyway
            </button>
          </div>
        </div>
      )}

      {/* Output (P3.11.8) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <AIStream content={output} loading={loading} />
      </div>

      {/* Chat input (P3.11.9) */}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          type="text"
          value={chat}
          onChange={(e) => setChat(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendChat();
            }
          }}
          placeholder="Ask a question…"
          className="font-sans flex-1 rounded-input border border-border bg-surface-secondary px-2.5 py-1.5 text-xs text-fg-primary placeholder:text-fg-muted"
        />
        <button
          type="button"
          onClick={sendChat}
          aria-label="Send"
          className="font-heading flex h-8 w-8 items-center justify-center rounded-input bg-accent text-sm text-surface-primary"
        >
          ↑
        </button>
      </div>

      {/* Hint row (P3.11.10) */}
      <div className="border-t border-border px-4 py-2">
        <p className="font-caption text-[10px] text-fg-muted">
          Esc to stop · ⌘/ toggle panel · ⌘K search
        </p>
      </div>
    </div>
  );
}

function labelScope(scope: AIScope): string {
  return scope === "all" ? "All" : scope === "folder" ? "Folder" : "File";
}
