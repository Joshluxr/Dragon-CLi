"use client";

import { useEffect, useRef } from "react";

export function AutoRefresh() {
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const SIX_HOURS_IN_MS = 6 * 60 * 60 * 1000;

    const checkAndRefresh = () => {
      const elapsedTime = Date.now() - startTimeRef.current;

      if (elapsedTime >= SIX_HOURS_IN_MS) {
        window.location.reload();
      }
    };

    // Check every minute
    const interval = setInterval(checkAndRefresh, 60 * 1000);

    // Also check on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkAndRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
