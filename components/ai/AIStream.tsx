"use client";

import { useEffect, useRef, useState } from "react";
import { renderMarkdown, renderMermaidBlocks } from "@/lib/markdown";

export interface AIStreamProps {
  /** Streaming markdown output. */
  content: string;
  /** True while a request is in flight (drives the pre-token pulse). */
  loading?: boolean;
}

/**
 * Renders streaming AI markdown. Re-runs the unified + mermaid pipeline whenever
 * `content` changes, debounced 100ms so token-by-token updates don't thrash the
 * renderer. Shows a 3-dot pulse while `loading` and no tokens have arrived yet.
 *
 * The model's output is untrusted, so the rendered HTML is run through
 * {@link sanitizeAiHtml} to strip `<script>` tags, inline event handlers, and
 * `javascript:` URLs before injection. This is a focused mitigation, not a full
 * sanitizer — DOMPurify-grade hardening is deferred to Phase 7 polish.
 */
export function AIStream({ content, loading = false }: AIStreamProps) {
  const [html, setHtml] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const rendered = await renderMarkdown(content);
        const withMermaid = await renderMermaidBlocks(rendered);
        setHtml(sanitizeAiHtml(withMermaid));
      } catch {
        setHtml("");
      }
    }, 100);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [content]);

  if (loading && content === "") {
    return (
      <div
        className="flex items-center gap-1.5 p-4"
        aria-live="polite"
        aria-label="AI is thinking"
      >
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
    );
  }

  if (!content && !loading) return null;

  return (
    <div
      className="folio-prose max-w-none overflow-y-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-fg-muted"
      style={{ animationDelay: delay }}
    />
  );
}

/** Strip the primary XSS vectors from model-generated HTML before injection. */
function sanitizeAiHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"');
}
