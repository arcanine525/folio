"use client";

import { PROMPT_KEYS } from "@/lib/prompts";

export interface QuickActionsProps {
  /** Currently highlighted chip (prompt key), or null. */
  selected: string | null;
  /** Called with the clicked chip's prompt key. */
  onSelect: (promptKey: string) => void;
}

/**
 * Horizontal, non-wrapping row of quick-action chips: Action items · Decisions ·
 * Questions · Timeline · Summary · Next steps. Inactive chips are neutral; the
 * selected chip gets the accent-light fill + accent text. Minimal Ink: Funnel
 * Sans 11px, 4px radius, surface-secondary bg, border.
 */
export function QuickActions({ selected, onSelect }: QuickActionsProps) {
  return (
    <div
      role="group"
      aria-label="Quick actions"
      className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {PROMPT_KEYS.map((key) => {
        const active = key === selected;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(key)}
            className={`shrink-0 whitespace-nowrap rounded-chip border px-2 py-1 font-caption text-[11px] transition-colors ${
              active
                ? "border-transparent bg-accent-light text-accent"
                : "border-border bg-surface-secondary text-fg-secondary hover:text-fg-primary"
            }`}
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
