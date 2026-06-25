"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useAppStore } from "@/store/appStore";
import { Sidebar } from "./Sidebar";
import { PanelResizer } from "./PanelResizer";

type MobileView = "files" | "edit" | "preview" | "ai";

interface AppShellProps {
  /** Main editor zone (already mode-switched by the page). */
  editorZone: ReactNode;
  /** Right-hand AI panel. Falls back to a placeholder until Phase 3. */
  aiPanel?: ReactNode;
}

/**
 * CSS-Grid 3-panel layout: sidebar · editor · AI panel, with 1px drag handles
 * between them. Column widths come from the Zustand store and feed CSS vars so
 * the template can switch per-breakpoint. Below 768px it collapses to a single
 * column with a bottom tab bar (Files · Edit · Preview · AI).
 */
export function AppShell({ editorZone, aiPanel }: AppShellProps) {
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const aiPanelWidth = useAppStore((s) => s.aiPanelWidth);
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen);
  const [mobileView, setMobileView] = useState<MobileView>("edit");

  const editorVisible = mobileView === "edit" || mobileView === "preview";

  const tabs: MobileView[] = ["files", "edit", "preview", "ai"];

  return (
    <div
      className="app-shell overflow-hidden"
      data-ai={aiPanelOpen ? "true" : "false"}
      style={
        {
          "--sidebar-w": `${sidebarWidth}px`,
          "--aipanel-w": `${aiPanelWidth}px`,
        } as CSSProperties
      }
      suppressHydrationWarning
    >
      {/* Sidebar — desktop: always; mobile: only on Files tab */}
      <div
        className={
          mobileView === "files" ? "flex min-h-0 md:flex" : "hidden md:flex"
        }
      >
        <Sidebar />
      </div>

      <PanelResizer side="sidebar" min={160} max={400} />

      {/* Editor zone */}
      <main
        className={
          editorVisible
            ? "flex min-h-0 min-w-0 flex-col md:flex"
            : "hidden min-w-0 md:flex"
        }
      >
        {editorZone}
      </main>

      {aiPanelOpen && (
        <>
          <PanelResizer side="aipanel" min={220} max={560} />
          <aside
            className={
              mobileView === "ai"
                ? "block min-w-0 md:block"
                : "hidden min-w-0 md:block"
            }
          >
            {aiPanel ?? <DefaultAIPanel />}
          </aside>
        </>
      )}

      {/* Mobile bottom tab bar */}
      <nav className="z-20 flex border-t border-border bg-surface-primary md:hidden">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileView(tab)}
            className={`font-caption flex-1 py-3 text-[11px] capitalize ${
              mobileView === tab ? "text-accent" : "text-fg-secondary"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Shown until the real AIPanel lands in Phase 3. */
function DefaultAIPanel() {
  return (
    <div className="flex h-full flex-col bg-surface-primary">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shadow-panel">
        <span className="font-heading text-[13px] font-semibold text-fg-primary">
          AI Assistant
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="font-caption text-center text-xs leading-relaxed text-fg-muted">
          Streaming summaries, scope selector, and quick actions arrive in
          Phase 3.
        </p>
      </div>
    </div>
  );
}
