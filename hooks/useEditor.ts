import { useCallback, useEffect, useRef, useState } from "react";
import * as opfs from "@/lib/opfs";
import { useAppStore } from "@/store/appStore";

export interface UseEditor {
  /** Current buffer (mirrors `store.content`). */
  content: string;
  /** True when the buffer differs from the last-saved snapshot. */
  isDirty: boolean;
  /** True while a debounced save is in flight. */
  saving: boolean;
  /** Editor onChange handler — updates the buffer and arms the autosave timer. */
  handleChange: (next: string) => void;
  /** Force-save the current buffer immediately, bypassing the debounce. */
  flush: () => Promise<void>;
}

/** Debounce window before an edit is flushed to OPFS. */
let autosaveDebounceMs = 800;

/** Test-only override so the debounce can be made instant or effectively never. */
export function __setAutosaveDebounceForTests(ms: number): void {
  autosaveDebounceMs = ms;
}

/**
 * Owns content loading + autosave for the active file.
 *
 * - When `activeFileId` changes, the file is read from OPFS and both the store
 *   `content` and a local `savedContent` snapshot are set (so `isDirty` starts
 *   clean). A pending save from the previous file is cancelled.
 * - `handleChange` writes the new value into the store and arms an 800ms timer;
 *   on fire it persists the buffer, updates the snapshot, and clears `saving`.
 * - On unmount (or file switch) the pending timer is cleared.
 *
 * `content` lives in the store so the editor and preview share one buffer; this
 * hook is its sole writer.
 */
export function useEditor(): UseEditor {
  const activeFileId = useAppStore((s) => s.activeFileId);
  const content = useAppStore((s) => s.content);
  const setContent = useAppStore((s) => s.setContent);
  const [savedContent, setSavedContent] = useState("");
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persist = useCallback(async () => {
    const { activeFileId: id, content: text } = useAppStore.getState();
    if (id == null) {
      setSaving(false);
      return;
    }
    await opfs.writeFile(id, text);
    setSavedContent(text);
    setSaving(false);
  }, []);

  // Load on activeFileId change; cancel any pending save for the prior file.
  useEffect(() => {
    clearTimer();
    let active = true;
    const load = async () => {
      setSaving(false);
      if (activeFileId == null) {
        if (active) {
          setContent("");
          setSavedContent("");
        }
        return;
      }
      try {
        const text = await opfs.readFile(activeFileId);
        if (!active) return;
        setContent(text);
        setSavedContent(text);
      } catch {
        if (!active) return;
        setContent("");
        setSavedContent("");
      }
    };
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileId]);

  const handleChange = useCallback(
    (next: string) => {
      setContent(next);
      setSaving(true);
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void persist();
      }, autosaveDebounceMs);
    },
    [clearTimer, persist, setContent],
  );

  const flush = useCallback(async () => {
    clearTimer();
    setSaving(true);
    await persist();
  }, [clearTimer, persist]);

  // Clear any pending save when the hook unmounts.
  useEffect(() => clearTimer, [clearTimer]);

  return {
    content,
    isDirty: content !== savedContent,
    saving,
    handleChange,
    flush,
  };
}
