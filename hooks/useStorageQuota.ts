import { useCallback, useEffect, useState } from "react";
import { onOpfsWrite } from "@/lib/opfs";

export interface UseStorageQuota {
  /** usage / quota exceeds the 0.8 threshold. */
  over: boolean;
  usage: number;
  quota: number;
  /** User has dismissed the banner for the current over-state. */
  dismissed: boolean;
  dismiss: () => void;
  /** Whether the warning banner should render. */
  showBanner: boolean;
}

const THRESHOLD = 0.8;

/**
 * Tracks OPFS storage pressure. Calls `navigator.storage.estimate()` on mount
 * and again after every successful OPFS write (via {@link onOpfsWrite}). When
 * usage exceeds 80% of quota, `showBanner` becomes true until the user
 * dismisses it.
 */
export function useStorageQuota(): UseStorageQuota {
  const [estimate, setEstimate] = useState({ usage: 0, quota: 0 });
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.storage?.estimate !== "function"
    ) {
      return;
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    setEstimate({ usage, quota });
  }, []);

  // Initial check + re-check after each write.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
    return onOpfsWrite(() => {
      void check();
    });
  }, [check]);

  const ratio = estimate.quota > 0 ? estimate.usage / estimate.quota : 0;
  const over = ratio > THRESHOLD;

  return {
    over,
    usage: estimate.usage,
    quota: estimate.quota,
    dismissed,
    dismiss: () => setDismissed(true),
    showBanner: over && !dismissed,
  };
}
