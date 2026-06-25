import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import matter from "gray-matter";
import mermaid from "mermaid";

/**
 * Singleton unified processor.
 * remark → rehype → HTML. `allowDangerousHtml` + `rehypeRaw` let raw HTML in
 * markdown pass through; `rehypeHighlight` adds syntax highlighting (skipping
 * unknown languages like `mermaid`).
 */
let processor: ReturnType<typeof buildProcessor> | null = null;

function buildProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeHighlight)
    .use(rehypeStringify);
}

function getProcessor() {
  if (!processor) processor = buildProcessor();
  return processor;
}

/**
 * Strip YAML frontmatter (via gray-matter) and render the remaining markdown
 * to an HTML string.
 */
export async function renderMarkdown(input: string): Promise<string> {
  const { content } = matter(input);
  const file = await getProcessor().process(content);
  return String(file);
}

let mermaidInitialized = false;

/** Defensive one-time mermaid init (also done from <MermaidInit/>). Idempotent. */
function ensureMermaid() {
  if (mermaidInitialized || typeof window === "undefined") return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    securityLevel: "loose",
    fontFamily: "var(--font-sans)",
  });
  mermaidInitialized = true;
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Find every `<pre><code class="language-mermaid">` block, render it to SVG via
 * `mermaid.render()`, and replace the wrapping `<pre>` with a
 * `<div class="mermaid-diagram">`. Unrenderable diagrams fall back to an
 * error placeholder so one bad block never blanks the whole preview.
 */
export async function renderMermaidBlocks(html: string): Promise<string> {
  if (typeof window === "undefined") return html;

  const blockRe =
    /<pre><code[^>]*class="[^"]*language-mermaid[^"]*"[^>]*>([\s\S]*?)<\/code><\/pre>/g;
  const matches = [...html.matchAll(blockRe)];
  if (matches.length === 0) return html;

  ensureMermaid();

  const replacements = await Promise.all(
    matches.map(async (match, index) => {
      const source = decodeHtml(match[1]);
      const id = `mermaid-${index}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        const { svg } = await mermaid.render(id, source);
        return { from: match[0], to: `<div class="mermaid-diagram">${svg}</div>` };
      } catch {
        return {
          from: match[0],
          to: `<div class="mermaid-diagram" style="color:var(--color-error)">⚠ Diagram could not be rendered.</div>`,
        };
      }
    }),
  );

  let out = html;
  for (const { from, to } of replacements) {
    out = out.replace(from, to);
  }
  return out;
}
