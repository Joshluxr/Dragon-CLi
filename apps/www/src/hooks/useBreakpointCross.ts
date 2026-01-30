"use client";

import { useEffect, useRef } from "react";

/**
 * Hook to detect when media query breakpoint is crossed
 * This helps prevent crashes when components swap between mobile/desktop versions
 * @param query - CSS media query string to monitor
 * @param onBreakpointCross - Callback when the breakpoint is crossed
 */
export function useBreakpointCross(
  query: string,
  onBreakpointCross: (matches: boolean) => void,
) {
  const lastMatchesRef = useRef<boolean | null>(null);

  useEffect(() => {
    // Check if we're in a browser environment
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(query);

    // Handler for media query changes
    const handleChange = (event: MediaQueryListEvent) => {
      // Only call the callback if we're actually crossing the breakpoint
      // (not on initial mount or if the value hasn't changed)
      if (
        lastMatchesRef.current !== null &&
        lastMatchesRef.current !== event.matches
      ) {
        onBreakpointCross(event.matches);
      }
      lastMatchesRef.current = event.matches;
    };

    // Set initial value without triggering callback
    lastMatchesRef.current = mediaQuery.matches;

    // Add event listener
    mediaQuery.addEventListener("change", handleChange);

    // Cleanup
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      lastMatchesRef.current = null;
    };
  }, [query, onBreakpointCross]);
}
