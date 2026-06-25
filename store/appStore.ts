import { create } from "zustand";
import type { FSNode } from "@/types";

/** Editor pane layout modes — cycled by the toolbar toggle and ⌘E. */
export type EditorMode = "split" | "source" | "preview";

const SIDEBAR_KEY = "folio.sidebarWidth";
const AIPANEL_KEY = "folio.aiPanelWidth";

const DEFAULT_SIDEBAR_WIDTH = 220;
const DEFAULT_AIPANEL_WIDTH = 300;

/** Read a persisted number from localStorage, SSR-safe. */
function readNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Write a number to localStorage, SSR-safe. */
function writeNumber(key: string, value: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

export interface AppState {
  /** OPFS file tree. Empty until `useFileTree.refresh()` populates it. */
  tree: FSNode[];
  /** Active file's OPFS path (the file id), or null when nothing is open. */
  activeFileId: string | null;
  /** Current editor buffer content. */
  content: string;
  /** Sidebar width in px, persisted to localStorage. */
  sidebarWidth: number;
  /** Whether the AI panel is visible. */
  aiPanelOpen: boolean;
  /** AI panel width in px, persisted to localStorage. */
  aiPanelWidth: number;
  /** Editor pane layout. */
  editorMode: EditorMode;

  setTree: (tree: FSNode[]) => void;
  setActiveFile: (id: string | null) => void;
  setContent: (content: string) => void;
  setSidebarWidth: (width: number) => void;
  setAiPanelWidth: (width: number) => void;
  setAiPanelOpen: (open: boolean) => void;
  toggleAiPanel: () => void;
  setEditorMode: (mode: EditorMode) => void;
}

export const useAppStore = create<AppState>()((set, get) => ({
  tree: [],
  activeFileId: null,
  content: "",
  // Defaults on the server; real persisted values on the client at init.
  sidebarWidth: readNumber(SIDEBAR_KEY, DEFAULT_SIDEBAR_WIDTH),
  aiPanelOpen: true,
  aiPanelWidth: readNumber(AIPANEL_KEY, DEFAULT_AIPANEL_WIDTH),
  editorMode: "split",

  setTree: (tree) => set({ tree }),
  setActiveFile: (activeFileId) => set({ activeFileId }),
  setContent: (content) => set({ content }),

  setSidebarWidth: (sidebarWidth) => {
    writeNumber(SIDEBAR_KEY, sidebarWidth);
    set({ sidebarWidth });
  },
  setAiPanelWidth: (aiPanelWidth) => {
    writeNumber(AIPANEL_KEY, aiPanelWidth);
    set({ aiPanelWidth });
  },

  setAiPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),
  toggleAiPanel: () => set({ aiPanelOpen: !get().aiPanelOpen }),
  setEditorMode: (editorMode) => set({ editorMode }),
}));
