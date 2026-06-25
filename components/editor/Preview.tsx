"use client";

import { useEffect, useState } from "react";
import { renderMarkdown, renderMermaidBlocks } from "@/lib/markdown";

interface PreviewProps {
  /** Raw markdown (frontmatter will be stripped before rendering). */
  content: string;
}

/**
 * Live markdown preview. Whenever `content` changes, runs the unified pipeline
 * and then `renderMermaidBlocks`, setting the resulting HTML into state.
 */
export function Preview({ content }: PreviewProps) {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const rendered = await renderMarkdown(content);
        const withMermaid = await renderMermaidBlocks(rendered);
        if (!cancelled) setHtml(withMermaid);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (error) {
    return (
      <div className="p-6 font-caption text-sm text-error">
        Preview failed to render: {error}
      </div>
    );
  }

  return (
    <article
      className="folio-prose max-w-none overflow-auto p-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
