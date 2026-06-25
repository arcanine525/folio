"use client";

export interface StorageQuotaBannerProps {
  visible: boolean;
  onDismiss: () => void;
  message?: string;
}

const DEFAULT_MESSAGE = "Storage 80%+ full. Export vault to free space.";

/**
 * Dismissable storage-pressure banner. Minimal Ink: error-bg surface, Geist 13px
 * error text, × button to dismiss. Renders nothing when `visible` is false.
 */
export function StorageQuotaBanner({
  visible,
  onDismiss,
  message = DEFAULT_MESSAGE,
}: StorageQuotaBannerProps) {
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 bg-error-bg px-3 py-2"
    >
      <p className="font-sans flex-1 text-[13px] leading-snug text-error">
        {message}
      </p>
      <button
        type="button"
        aria-label="Dismiss storage warning"
        onClick={onDismiss}
        className="font-sans mt-px text-error transition-opacity hover:opacity-70"
      >
        ×
      </button>
    </div>
  );
}
