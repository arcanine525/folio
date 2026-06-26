"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/appStore";
import type { SearchFilter, SearchResult } from "@/lib/searchIndex";

const FILTER_TABS = ["All", "Meetings", "Projects", "Notes"] as const;
type FilterTab = (typeof FILTER_TABS)[number];

interface SearchModalProps {
  /** Results for the current query, produced by the root useSearch hook. */
  results: SearchResult[];
  /** True while a search is debouncing / the worker is computing. */
  loading: boolean;
  /** Debounced search driver (from useSearch). */
  onSearch: (query: string, filter?: SearchFilter) => void;
}

/**
 * ⌘K command palette (P4.6). Open state + pre-fill query live in the app store
 * (set by the ⌘K shortcut and by tag pills); results/loading/onSearch come from
 * the single root useSearch instance. The modal owns its input, active filter
 * tab, and keyboard-navigated active index, and selects a file into the editor
 * via `setActiveFile` (useEditor loads its content on the id change).
 *
 * The `#tag` prefix (from a clicked tag pill) is parsed into a tag filter.
 */
export function SearchModal({ results, loading, onSearch }: SearchModalProps) {
  const open = useAppStore((s) => s.searchOpen);
  const setOpen = useAppStore((s) => s.setSearchOpen);
  const setActiveFile = useAppStore((s) => s.setActiveFile);
  const initialQuery = useAppStore((s) => s.searchInitialQuery);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<FilterTab>("All");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Seed the query + focus the input whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    // Syncing external open/initialQuery state into local editable state on open.
    /* eslint-disable react-hooks/set-state-in-effect */
    setQuery(initialQuery);
    setTab("All");
    setActiveIndex(0);
    /* eslint-enable react-hooks/set-state-in-effect */
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open, initialQuery]);

  // Drive a (debounced) search whenever the open state or query changes.
  useEffect(() => {
    if (!open) return;
    const { query: workerQuery, filter } = toWorkerQuery(query);
    onSearch(workerQuery, filter);
  }, [open, query, onSearch]);

  const filtered = filterByTab(results, tab);

  // Keep the active index in range as the result set changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex((i) => (filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  const select = (path: string) => {
    setActiveFile(path);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = filtered[activeIndex];
      if (hit) select(hit.path);
    } else if (e.key === "Tab") {
      // "Preview" — open the file in the editor (no separate preview pane yet).
      e.preventDefault();
      const hit = filtered[activeIndex];
      if (hit) select(hit.path);
    }
  };

  return (
    // Backdrop: clicking it closes the modal.
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-modal bg-surface-primary shadow-modal"
      >
        {/* Search input (P4.6.3) */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="font-sans text-[15px] text-fg-muted">⌕</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search files…"
            className="font-heading flex-1 bg-transparent text-[15px] font-medium text-fg-primary placeholder:text-fg-muted focus:outline-none"
          />
          <kbd className="font-caption rounded-chip border border-border bg-surface-secondary px-1.5 py-0.5 text-[11px] text-fg-muted">
            esc
          </kbd>
        </div>

        {/* Filter tabs + result count (P4.6.4/5) */}
        <div className="flex items-center gap-1 px-3 py-2">
          {FILTER_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`font-caption rounded-chip px-2 py-0.5 text-[11px] ${
                tab === t
                  ? "bg-accent-light text-accent"
                  : "text-fg-secondary hover:bg-surface-secondary"
              }`}
            >
              {t}
            </button>
          ))}
          <span className="font-caption ml-auto text-[11px] text-fg-muted">
            {filtered.length} {filtered.length === 1 ? "result" : "results"}
          </span>
        </div>

        {/* Results (P4.6.6/7) */}
        <div className="max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="font-sans px-3 py-3 text-xs text-fg-muted">Searching…</div>
          ) : filtered.length === 0 ? (
            <div className="font-sans px-3 py-3 text-xs text-fg-muted">No results</div>
          ) : (
            filtered.map((r, i) => {
              const active = i === activeIndex;
              return (
                <button
                  key={r.path}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => select(r.path)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left ${
                    active ? "bg-accent-light" : "hover:bg-surface-secondary"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-heading text-[13px] font-semibold ${
                        active ? "text-accent" : "text-fg-primary"
                      }`}
                    >
                      {r.name}
                    </span>
                    <span className="font-sans text-xs text-fg-muted">·</span>
                    <span className="font-caption text-[11px] text-fg-muted">
                      {folderOf(r.path) || "root"}
                    </span>
                  </div>
                  {r.excerpt && (
                    <span className="font-sans text-xs text-fg-secondary">{r.excerpt}</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer keyboard hints (P4.6.9) */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2">
          <FooterHint keys={["↑", "↓"]} label="navigate" />
          <FooterHint keys={["↵"]} label="open" />
          <FooterHint keys={["tab"]} label="preview" />
          <FooterHint keys={["esc"]} label="close" />
        </div>
      </div>
    </div>
  );
}

/** Folder portion of a path ("" for a root-level file). */
function folderOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** Narrow results to a category tab via a path substring match. */
function filterByTab(results: SearchResult[], tab: FilterTab): SearchResult[] {
  if (tab === "All") return results;
  const keyword = tab.toLowerCase().replace(/s$/, ""); // meetings→meeting, etc.
  return results.filter((r) => r.path.toLowerCase().includes(keyword));
}

/**
 * Convert the input query into a worker query (+ optional filter). A leading
 * `#tag` (from a clicked tag pill) becomes a tag-scoped search.
 */
function toWorkerQuery(query: string): { query: string; filter?: SearchFilter } {
  const tagMatch = query.match(/^#([\w-]+)/);
  if (tagMatch) return { query: tagMatch[1], filter: { tag: tagMatch[1] } };
  return { query };
}

/** One footer key-hint: Geist Mono keys in a chip, Funnel Sans label. */
function FooterHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="font-mono rounded-chip border border-border bg-surface-secondary px-1.5 py-0.5 text-[10px] text-fg-secondary"
        >
          {k}
        </kbd>
      ))}
      <span className="font-caption text-[11px] text-fg-muted">{label}</span>
    </span>
  );
}
