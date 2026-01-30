/**
 * Browser Session Manager
 *
 * Manages headless browser sessions for visual testing and automation.
 * Uses Playwright for browser control. Playwright is dynamically imported
 * at runtime since it's only available in sandbox environments.
 */

import type { ConsoleLog } from "./types";

export interface BrowserSessionOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
}

export interface PageInfo {
  title: string;
  url: string;
}

// Use 'any' types since playwright is only available at runtime in sandbox
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BrowserInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PageInstance = any;

/**
 * Dynamically import playwright
 * This uses Function constructor to avoid TypeScript static analysis
 */
async function importPlaywright(): Promise<{
  chromium: {
    launch: (options?: {
      headless?: boolean;
      args?: string[];
    }) => Promise<BrowserInstance>;
  };
}> {
  // Use dynamic import via Function to bypass TypeScript module resolution
  const importFn = new Function(
    'return import("playwright")',
  ) as () => Promise<{ chromium: BrowserInstance }>;
  return importFn();
}

/**
 * Browser session that wraps Playwright browser instance.
 * Provides methods for navigation, interaction, and screenshot capture.
 */
export class BrowserSession {
  private browser: BrowserInstance | null = null;
  private page: PageInstance | null = null;
  private consoleLogs: ConsoleLog[] = [];
  private sessionTimeout: NodeJS.Timeout | null = null;
  private maxSessionDuration: number;

  constructor(maxSessionDuration: number = 5 * 60 * 1000) {
    this.maxSessionDuration = maxSessionDuration;
  }

  /**
   * Launch a new browser instance
   */
  async launch(options: BrowserSessionOptions = {}): Promise<void> {
    const { chromium } = await importPlaywright();

    this.browser = await chromium.launch({
      headless: options.headless ?? true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await this.browser.newContext({
      viewport: options.viewport || { width: 1280, height: 720 },
    });

    this.page = await context.newPage();

    // Capture console logs
    this.page.on(
      "console",
      (msg: { type: () => string; text: () => string }) => {
        this.consoleLogs.push({
          type: msg.type() as ConsoleLog["type"],
          text: msg.text(),
          timestamp: Date.now(),
        });
      },
    );

    // Capture errors
    this.page.on("pageerror", (error: Error) => {
      this.consoleLogs.push({
        type: "error",
        text: error.message,
        timestamp: Date.now(),
      });
    });

    // Set session timeout
    this.sessionTimeout = setTimeout(() => {
      this.close().catch(() => {});
    }, this.maxSessionDuration);
  }

  /**
   * Navigate to a URL
   */
  async navigate(
    url: string,
    waitUntil?: "load" | "domcontentloaded" | "networkidle",
  ): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");

    await this.page.goto(url, {
      waitUntil: waitUntil || "networkidle",
      timeout: 30000,
    });
  }

  /**
   * Take a screenshot
   */
  async screenshot(options?: {
    fullPage?: boolean;
    selector?: string;
  }): Promise<string> {
    if (!this.page) throw new Error("Browser not launched");

    let buffer: Buffer;

    if (options?.selector) {
      const element = await this.page.$(options.selector);
      if (!element) throw new Error(`Element not found: ${options.selector}`);
      buffer = await element.screenshot();
    } else {
      buffer = await this.page.screenshot({
        fullPage: options?.fullPage ?? false,
      });
    }

    return buffer.toString("base64");
  }

  /**
   * Click on an element
   */
  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await this.page.click(selector, { timeout: 10000 });
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string, _delay?: number): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await this.page.fill(selector, text);
  }

  /**
   * Scroll the page
   */
  async scroll(
    direction: "up" | "down" | "left" | "right",
    amount: number,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");

    const scrollMap: {
      [K in "up" | "down" | "left" | "right"]: [number, number];
    } = {
      up: [0, -amount],
      down: [0, amount],
      left: [-amount, 0],
      right: [amount, 0],
    };

    const scrollData = scrollMap[direction];
    const deltaX = scrollData[0];
    const deltaY = scrollData[1];
    // The evaluate function runs in browser context where window is available
    await this.page.evaluate(
      ({ dx, dy }: { dx: number; dy: number }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).scrollBy(dx, dy);
      },
      { dx: deltaX, dy: deltaY },
    );
  }

  /**
   * Wait for an element to appear
   */
  async waitFor(selector: string, timeout?: number): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await this.page.waitForSelector(selector, { timeout: timeout || 30000 });
  }

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate<T>(script: string): Promise<T> {
    if (!this.page) throw new Error("Browser not launched");
    return (await this.page.evaluate(script)) as T;
  }

  /**
   * Get all captured console logs
   */
  getConsoleLogs(): ConsoleLog[] {
    return [...this.consoleLogs];
  }

  /**
   * Clear console logs
   */
  clearConsoleLogs(): void {
    this.consoleLogs = [];
  }

  /**
   * Get current page info
   */
  async getPageInfo(): Promise<PageInfo> {
    if (!this.page) throw new Error("Browser not launched");
    return {
      title: await this.page.title(),
      url: this.page.url(),
    };
  }

  /**
   * Check if browser is launched
   */
  isLaunched(): boolean {
    return this.browser !== null;
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
