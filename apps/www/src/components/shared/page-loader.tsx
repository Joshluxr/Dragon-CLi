"use client";

import { useRef, useEffect } from "react";

export function PageLoader() {
  // This is so complicated because useEffect runs twice in development
  // and we need to use a timer to debounce the clean up.
  const cleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressBar = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (cleanupTimer.current) {
      clearTimeout(cleanupTimer.current);
      cleanupTimer.current = null;
    }
    if (!progressBar.current) {
      const turboProgressBar = document.createElement("div");
      turboProgressBar.id = "turbo-progress-bar";
      turboProgressBar.style.position = "fixed";
      turboProgressBar.style.top = "0";
      turboProgressBar.style.left = "0";
      turboProgressBar.classList.add(
        "z-[2147483647]",
        "h-[3px]",
        "w-0",
        "bg-primary",
        "transform-gpu",
        "animate-loading-progress",
      );
      document.body.appendChild(turboProgressBar);
      progressBar.current = turboProgressBar;
    }
    return () => {
      cleanupTimer.current = setTimeout(() => {
        if (progressBar.current) {
          progressBar.current.style.width =
            progressBar.current.offsetWidth + "px";
          progressBar.current.classList.remove("animate-loading-progress");
          progressBar.current.classList.add("animate-loading-complete");
          setTimeout(() => {
            progressBar.current?.remove();
          }, 200);
        }
      }, 100);
    };
  }, []);

  return null;
}
