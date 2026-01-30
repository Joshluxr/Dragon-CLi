import type { ITheme } from "xterm";

// Theme colors matching xterm-terminal.tsx WCAG AA contrast requirements
export const DARK_THEME_COLORS: ITheme = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  black: "#858585",
  red: "#d85e5e",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#3c88dc",
  magenta: "#c85ac8",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#9a9a9a",
  brightRed: "#ff6f6f",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#5aaaf2",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#ffffff",
};

export const LIGHT_THEME_COLORS: ITheme = {
  background: "#f8f5f0",
  foreground: "#1f1f1f",
  cursor: "#1f1f1f",
  black: "#000000",
  red: "#a11616",
  green: "#13704a",
  yellow: "#7f6a00",
  blue: "#1f5ca6",
  magenta: "#8a2f8a",
  cyan: "#0b6f88",
  white: "#3d3d3d",
  brightBlack: "#3a3a3a",
  brightRed: "#d32f2f",
  brightGreen: "#197c52",
  brightYellow: "#a35f00",
  brightBlue: "#2666b0",
  brightMagenta: "#9b349b",
  brightCyan: "#0f7798",
  brightWhite: "#1f1f1f",
};

/**
 * Get ANSI colors based on theme (for ansi-to-html conversion)
 */
export function getAnsiColors(theme: "light" | "dark"): Record<number, string> {
  const colors = theme === "dark" ? DARK_THEME_COLORS : LIGHT_THEME_COLORS;
  return {
    0: colors.black!,
    1: colors.red!,
    2: colors.green!,
    3: colors.yellow!,
    4: colors.blue!,
    5: colors.magenta!,
    6: colors.cyan!,
    7: colors.white!,
    8: colors.brightBlack!,
    9: colors.brightRed!,
    10: colors.brightGreen!,
    11: colors.brightYellow!,
    12: colors.brightBlue!,
    13: colors.brightMagenta!,
    14: colors.brightCyan!,
    15: colors.brightWhite!,
  };
}
