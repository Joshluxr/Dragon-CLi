"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

export function ThemeColorMeta() {
  const { theme, systemTheme } = useTheme();
  const isDark =
    theme === "dark" || (theme === "system" && systemTheme === "dark");
  useEffect(() => {
    const meta = document.querySelector("meta[name='theme-color']");
    if (meta) {
      meta.setAttribute("content", isDark ? "#1a1a1a" : "#f8f5f0");
    }
  }, [isDark]);
  return null;
}
