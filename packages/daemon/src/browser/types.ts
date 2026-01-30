/**
 * Browser Automation Types for Daemon
 */

export type BrowserAction =
  | "launch"
  | "navigate"
  | "screenshot"
  | "click"
  | "type"
  | "scroll"
  | "get_console"
  | "wait_for"
  | "evaluate"
  | "close";

export interface BrowserParams {
  headless?: boolean;
  viewport?: { width: number; height: number };
  url?: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  fullPage?: boolean;
  selector?: string;
  text?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  amount?: number;
  timeout?: number;
  script?: string;
}

export interface BrowserTool {
  type: "browser";
  action: BrowserAction;
  params: BrowserParams;
}

export interface ConsoleLog {
  type: "log" | "warn" | "error" | "info";
  text: string;
  timestamp: number;
}

export interface BrowserResult {
  success: boolean;
  data?: {
    screenshot?: string;
    console?: ConsoleLog[];
    evaluateResult?: unknown;
    pageTitle?: string;
    pageUrl?: string;
  };
  error?: string;
}
