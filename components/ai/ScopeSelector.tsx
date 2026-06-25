"use client";

import type { AIScope } from "@/types";

const SCOPES: { value: AIScope; label: string }[] = [
  { value: "file", label: "File" },
  { value: "folder", label: "Folder" },
  { value: "all", label: "All" },
];

export interface ScopeSelectorProps {
  /** Currently selected scope. */
  value: AIScope;
  /** Called with the newly selected scope. */
  onChange: (scope: AIScope) => void;
}

/**
 * File / Folder / All pill toggle for the AI panel header. Active pill is accent
 * fill with white caption text; inactive pills are transparent with secondary
 * text. Minimal Ink: 4px radius, Funnel Sans 11px.
 */
export function ScopeSelector({ value, onChange }: ScopeSelectorProps) {
  return (
    <div role="group" aria-label="Context scope" className="flex items-center gap-1">
      {SCOPES.map((s) => {
        const active = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(s.value)}
            className={`rounded-chip px-2 py-0.5 font-caption text-[11px] transition-colors ${
              active
                ? "bg-accent font-semibold text-surface-primary"
                : "text-fg-secondary hover:text-fg-primary"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
