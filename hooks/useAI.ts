import { useCallback, useEffect, useRef, useState } from "react";
import { streamAI } from "@/lib/ai";
import { useSettingsStore } from "@/store/settingsStore";
import type { AIMessage } from "@/types";

export interface UseAI {
  /** Accumulated streaming output for the current run. */
  output: string;
  /** True while a stream is in flight. */
  loading: boolean;
  /** Human-readable error from the last run, or null. */
  error: string | null;
  /** Conversation history (user + assistant turns) accumulated across runs. */
  history: AIMessage[];
  /** Stream a turn. Aborts any in-flight run first. */
  run: (userMessage: string, systemPrompt: string, contextContent: string) => Promise<void>;
  /** Abort the in-flight stream (no-op if idle). */
  stop: () => void;
  /** Clear conversation history. */
  clearHistory: () => void;
}

/**
 * Provider-agnostic AI run/stop/clearHistory hook. Reads the active provider +
 * key from {@link useSettingsStore}, guards on missing provider/key, wraps the
 * document context around the user message, streams tokens into `output`, and
 * appends the completed turn to `history`.
 *
 * - AbortError (from `stop()` or a new run) is swallowed silently.
 * - Any other error is surfaced via `error`.
 * - The in-flight stream is aborted on unmount.
 */
export function useAI(): UseAI {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AIMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (userMessage: string, systemPrompt: string, contextContent: string) => {
      const { getActive, keys } = useSettingsStore.getState();
      const provider = getActive();

      // P3.5.3 — guard before doing any network work.
      if (!provider) {
        setError("No AI provider configured");
        return;
      }
      const apiKey = keys[provider.id];
      if (provider.mode === "byok" && !apiKey) {
        setError("needs an API key — open Settings → AI");
        return;
      }

      // Abort any in-flight request, then arm a fresh controller.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Wrap the context around the user's message.
      const userContent = `<document>\n${contextContent}\n</document>\n\n${userMessage}`;
      const messages: AIMessage[] = [...history, { role: "user", content: userContent }];

      setOutput("");
      setError(null);
      setLoading(true);

      let acc = "";
      try {
        for await (const delta of streamAI(messages, systemPrompt, provider, apiKey, controller.signal)) {
          if (controller.signal.aborted) break;
          acc += delta;
          setOutput(acc);
        }
        // Record the turn only if the run completed (not aborted).
        if (!controller.signal.aborted) {
          setHistory([...messages, { role: "assistant", content: acc }]);
        }
      } catch (e) {
        if (controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
          // Aborted by stop() or a newer run — swallow.
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setLoading(false);
      }
    },
    [history],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  // Abort the in-flight stream when the component unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { output, loading, error, history, run, stop, clearHistory };
}
