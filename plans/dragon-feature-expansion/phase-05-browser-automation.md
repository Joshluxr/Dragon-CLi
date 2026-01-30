# Phase 5: Browser Automation

**Status**: Pending
**Priority**: 5
**Effort**: High

---

## Overview

Enable agents to interact with web browsers for:

1. Visual testing and verification
2. Screenshot capture for UI bugs
3. End-to-end testing
4. Runtime error debugging via console logs
5. Interactive testing (click, type, scroll)

---

## How It Works

```
1. Agent needs to verify frontend changes
2. Agent launches headless browser in sandbox
3. Agent navigates to local dev server
4. Agent captures screenshots, console logs
5. Agent can interact: click, type, scroll
6. Screenshots are sent to UI for visual inspection
7. Agent can compare before/after visually
```

---

## Files to Modify

### 1. Sandbox Image Update (`packages/sandbox-image/`)

Add Playwright/Puppeteer to sandbox image:

```dockerfile
# packages/sandbox-image/Dockerfile additions

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright
RUN npm install -g playwright
RUN npx playwright install chromium
```

### 2. Browser Tool Schema (`packages/daemon/src/tools/browser.ts`)

```typescript
// packages/daemon/src/tools/browser.ts

export interface BrowserTool {
  type: "browser";
  action:
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
  params: BrowserParams;
}

export interface BrowserParams {
  // Launch
  headless?: boolean;
  viewport?: { width: number; height: number };

  // Navigate
  url?: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";

  // Screenshot
  fullPage?: boolean;
  selector?: string; // Element to screenshot

  // Click/Type
  selector?: string;
  text?: string; // For type action
  delay?: number; // Typing delay in ms

  // Scroll
  direction?: "up" | "down" | "left" | "right";
  amount?: number; // pixels

  // Wait
  selector?: string;
  timeout?: number;

  // Evaluate
  script?: string;
}

export interface BrowserResult {
  success: boolean;
  data?: {
    screenshot?: string; // Base64
    console?: ConsoleLog[];
    evaluateResult?: unknown;
    pageTitle?: string;
    pageUrl?: string;
  };
  error?: string;
}

export interface ConsoleLog {
  type: "log" | "warn" | "error" | "info";
  text: string;
  timestamp: number;
}
```

### 3. Browser Session Manager (`packages/daemon/src/browser/session.ts`)

```typescript
// packages/daemon/src/browser/session.ts

import { chromium, Browser, Page } from "playwright";

export class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private consoleLogs: ConsoleLog[] = [];

  async launch(options: {
    headless?: boolean;
    viewport?: { width: number; height: number };
  }): Promise<void> {
    this.browser = await chromium.launch({
      headless: options.headless ?? true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await this.browser.newContext({
      viewport: options.viewport || { width: 1280, height: 720 },
    });

    this.page = await context.newPage();

    // Capture console logs
    this.page.on("console", (msg) => {
      this.consoleLogs.push({
        type: msg.type() as ConsoleLog["type"],
        text: msg.text(),
        timestamp: Date.now(),
      });
    });

    // Capture errors
    this.page.on("pageerror", (error) => {
      this.consoleLogs.push({
        type: "error",
        text: error.message,
        timestamp: Date.now(),
      });
    });
  }

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

  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await this.page.click(selector, { timeout: 10000 });
  }

  async type(selector: string, text: string, delay?: number): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await this.page.fill(selector, text);
  }

  async scroll(
    direction: "up" | "down" | "left" | "right",
    amount: number,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");

    const scrollMap = {
      up: [0, -amount],
      down: [0, amount],
      left: [-amount, 0],
      right: [amount, 0],
    };

    const [x, y] = scrollMap[direction];
    await this.page.evaluate(
      ([deltaX, deltaY]) => {
        window.scrollBy(deltaX, deltaY);
      },
      [x, y],
    );
  }

  async waitFor(selector: string, timeout?: number): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await this.page.waitForSelector(selector, { timeout: timeout || 30000 });
  }

  async evaluate<T>(script: string): Promise<T> {
    if (!this.page) throw new Error("Browser not launched");
    return (await this.page.evaluate(script)) as T;
  }

  getConsoleLogs(): ConsoleLog[] {
    return [...this.consoleLogs];
  }

  clearConsoleLogs(): void {
    this.consoleLogs = [];
  }

  async getPageInfo(): Promise<{ title: string; url: string }> {
    if (!this.page) throw new Error("Browser not launched");
    return {
      title: await this.page.title(),
      url: this.page.url(),
    };
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
```

### 4. Browser Tool Handler (`packages/daemon/src/tools/browser-handler.ts`)

```typescript
// packages/daemon/src/tools/browser-handler.ts

import { BrowserSession } from "../browser/session";

const sessions: Map<string, BrowserSession> = new Map();

export async function handleBrowserTool(
  threadId: string,
  tool: BrowserTool,
): Promise<BrowserResult> {
  try {
    switch (tool.action) {
      case "launch": {
        const session = new BrowserSession();
        await session.launch({
          headless: tool.params.headless,
          viewport: tool.params.viewport,
        });
        sessions.set(threadId, session);
        return { success: true };
      }

      case "navigate": {
        const session = getSession(threadId);
        await session.navigate(tool.params.url!, tool.params.waitUntil);
        const pageInfo = await session.getPageInfo();
        return {
          success: true,
          data: { pageTitle: pageInfo.title, pageUrl: pageInfo.url },
        };
      }

      case "screenshot": {
        const session = getSession(threadId);
        const screenshot = await session.screenshot({
          fullPage: tool.params.fullPage,
          selector: tool.params.selector,
        });
        return { success: true, data: { screenshot } };
      }

      case "click": {
        const session = getSession(threadId);
        await session.click(tool.params.selector!);
        return { success: true };
      }

      case "type": {
        const session = getSession(threadId);
        await session.type(
          tool.params.selector!,
          tool.params.text!,
          tool.params.delay,
        );
        return { success: true };
      }

      case "scroll": {
        const session = getSession(threadId);
        await session.scroll(tool.params.direction!, tool.params.amount!);
        return { success: true };
      }

      case "get_console": {
        const session = getSession(threadId);
        const logs = session.getConsoleLogs();
        return { success: true, data: { console: logs } };
      }

      case "wait_for": {
        const session = getSession(threadId);
        await session.waitFor(tool.params.selector!, tool.params.timeout);
        return { success: true };
      }

      case "evaluate": {
        const session = getSession(threadId);
        const result = await session.evaluate(tool.params.script!);
        return { success: true, data: { evaluateResult: result } };
      }

      case "close": {
        const session = sessions.get(threadId);
        if (session) {
          await session.close();
          sessions.delete(threadId);
        }
        return { success: true };
      }

      default:
        return { success: false, error: `Unknown action: ${tool.action}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

function getSession(threadId: string): BrowserSession {
  const session = sessions.get(threadId);
  if (!session) throw new Error("Browser not launched. Use 'launch' first.");
  return session;
}
```

### 5. Browser Tool Message Type

```typescript
// packages/shared/src/db/db-message.ts

export interface DBBrowserToolCall {
  type: "tool-call";
  name: "browser";
  arguments: BrowserTool;
  id: string;
}

export interface DBBrowserToolResult {
  type: "tool-result";
  name: "browser";
  id: string;
  result: {
    success: boolean;
    screenshot?: string;
    console?: ConsoleLog[];
    evaluateResult?: unknown;
    error?: string;
  };
}
```

### 6. Screenshot Display Component

```typescript
// apps/www/src/components/chat/browser-screenshot.tsx

export function BrowserScreenshot({ result }: { result: DBBrowserToolResult }) {
  const [expanded, setExpanded] = useState(false);

  if (!result.result.screenshot) return null;

  return (
    <div className="my-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Monitor className="h-4 w-4" />
        <span>Browser Screenshot</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Collapse" : "Expand"}
        </Button>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-lg border transition-all",
          expanded ? "max-h-none" : "max-h-64"
        )}
      >
        <img
          src={`data:image/png;base64,${result.result.screenshot}`}
          alt="Browser screenshot"
          className="w-full"
        />
      </div>

      {result.result.console && result.result.console.length > 0 && (
        <div className="mt-2">
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Console Logs ({result.result.console.length})
            </summary>
            <div className="bg-muted p-2 rounded mt-1 max-h-48 overflow-y-auto">
              {result.result.console.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-xs font-mono",
                    log.type === "error" && "text-red-500",
                    log.type === "warn" && "text-yellow-500"
                  )}
                >
                  [{log.type}] {log.text}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
```

### 7. Agent Instructions for Browser Tool

```typescript
// Add to agent system prompt when browser is available

const browserInstructions = `
## Browser Tool

You have access to a browser for visual testing. Use it to:
- Verify UI changes
- Debug runtime errors
- Capture screenshots
- Test user interactions

### Available Actions:

1. **Launch browser**:
   \`\`\`json
   {"type": "browser", "action": "launch", "params": {"headless": true, "viewport": {"width": 1280, "height": 720}}}
   \`\`\`

2. **Navigate to URL**:
   \`\`\`json
   {"type": "browser", "action": "navigate", "params": {"url": "http://localhost:3000", "waitUntil": "networkidle"}}
   \`\`\`

3. **Take screenshot**:
   \`\`\`json
   {"type": "browser", "action": "screenshot", "params": {"fullPage": true}}
   \`\`\`

4. **Click element**:
   \`\`\`json
   {"type": "browser", "action": "click", "params": {"selector": "button[data-testid='submit']"}}
   \`\`\`

5. **Type text**:
   \`\`\`json
   {"type": "browser", "action": "type", "params": {"selector": "input[name='email']", "text": "test@example.com"}}
   \`\`\`

6. **Get console logs**:
   \`\`\`json
   {"type": "browser", "action": "get_console", "params": {}}
   \`\`\`

7. **Close browser**:
   \`\`\`json
   {"type": "browser", "action": "close", "params": {}}
   \`\`\`

### Tips:
- Always close the browser when done
- Use "get_console" to check for JavaScript errors
- Take screenshots before and after changes for comparison
- Use "wait_for" before interacting with dynamic elements
`;
```

---

## Testing Strategy

```typescript
describe("Browser Automation", () => {
  let session: BrowserSession;

  beforeEach(async () => {
    session = new BrowserSession();
    await session.launch({ headless: true });
  });

  afterEach(async () => {
    await session.close();
  });

  it("navigates to URL", async () => {
    await session.navigate("https://example.com");
    const info = await session.getPageInfo();
    expect(info.url).toContain("example.com");
  });

  it("captures screenshot", async () => {
    await session.navigate("https://example.com");
    const screenshot = await session.screenshot();
    expect(screenshot).toBeTruthy();
    expect(screenshot.length).toBeGreaterThan(1000); // Has content
  });

  it("captures console logs", async () => {
    await session.navigate(
      "data:text/html,<script>console.log('test')</script>",
    );
    await new Promise((r) => setTimeout(r, 100));
    const logs = session.getConsoleLogs();
    expect(logs.some((l) => l.text === "test")).toBe(true);
  });

  it("clicks and types", async () => {
    await session.navigate("data:text/html,<input id='test' />");
    await session.type("#test", "hello");
    const value = await session.evaluate(
      "document.querySelector('#test').value",
    );
    expect(value).toBe("hello");
  });
});
```

---

## Security Considerations

- Run browser in sandbox with no external network access (except localhost)
- Timeout all browser operations
- Limit screenshot size (resize if too large)
- Don't allow navigation to arbitrary URLs (whitelist localhost/internal)
- Clear session data between runs
- Rate limit browser launches
