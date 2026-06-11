"use client";

import { useEffect } from "react";

/**
 * Requests persistent storage on first load so the browser is less likely to
 * evict the IndexedDB collection under storage pressure. Renders nothing.
 * Fails silently — persistence is best-effort and never blocks the app.
 */
export function StoragePersist() {
  useEffect(() => {
    if (
      typeof navigator !== "undefined" &&
      navigator.storage &&
      typeof navigator.storage.persist === "function"
    ) {
      navigator.storage.persist().catch(() => {
        /* best-effort; ignore */
      });
    }
  }, []);

  return null;
}
