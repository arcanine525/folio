"use client";

import { useEffect } from "react";
import mermaid from "mermaid";

/**
 * Initialises Mermaid exactly once on the client.
 *
 * Rendered from `app/layout.tsx`. Mermaid touches the DOM, so it cannot be
 * initialised in a Server Component module (that code never ships to the
 * browser). `startOnLoad: false` because we render diagrams explicitly via
 * `mermaid.render()` inside the preview pipeline.
 */
export function MermaidInit() {
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "neutral",
      securityLevel: "loose",
      fontFamily: "var(--font-sans)",
    });
  }, []);

  return null;
}
