"use client";

import { useCallback } from "react";
import { useAppStore } from "@/store/appStore";

interface PanelResizerProps {
  /** Which neighbouring panel this divider resizes. */
  side: "sidebar" | "aipanel";
  /** Min/max width in px. */
  min: number;
  max: number;
}

/**
 * A 1px vertical drag handle. Width is read from the store at drag start and
 * written back live on `mousemove` (and persisted), then listeners tear down
 * on `mouseup`. An invisible ±8px hit area makes it easy to grab.
 */
export function PanelResizer({ side, min, max }: PanelResizerProps) {
  const setWidth = useAppStore((s) =>
    side === "sidebar" ? s.setSidebarWidth : s.setAiPanelWidth,
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();

      const startX = e.clientX;
      const startWidth =
        side === "sidebar"
          ? useAppStore.getState().sidebarWidth
          : useAppStore.getState().aiPanelWidth;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        // Sidebar grows dragging right; AI panel grows dragging left.
        const delta = ev.clientX - startX;
        const next = side === "sidebar" ? startWidth + delta : startWidth - delta;
        setWidth(Math.min(max, Math.max(min, next)));
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [side, min, max, setWidth],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      onDoubleClick={() =>
        setWidth(side === "sidebar" ? 220 : 300)
      }
      className="group relative hidden w-px shrink-0 cursor-col-resize bg-border md:block"
    >
      {/* Invisible grab target */}
      <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
      {/* Accent line on hover */}
      <div className="absolute inset-y-0 left-0 w-px bg-accent opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}
