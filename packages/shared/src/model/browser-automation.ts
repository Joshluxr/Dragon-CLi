/**
 * Browser Automation Types
 *
 * Types and configurations for headless browser automation.
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
  // Launch
  headless?: boolean;
  viewport?: { width: number; height: number };

  // Navigate
  url?: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";

  // Screenshot
  fullPage?: boolean;
  selector?: string;

  // Click/Type
  text?: string;
  delay?: number;

  // Scroll
  direction?: "up" | "down" | "left" | "right";
  amount?: number;

  // Wait
  timeout?: number;

  // Evaluate
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
    screenshot?: string; // Base64
    console?: ConsoleLog[];
    evaluateResult?: unknown;
    pageTitle?: string;
    pageUrl?: string;
  };
  error?: string;
}

export interface BrowserConfig {
  enabled: boolean;
  allowedDomains: string[];
  maxScreenshotSize: number;
  maxSessionDuration: number;
  defaultViewport: { width: number; height: number };
}

export const defaultBrowserConfig: BrowserConfig = {
  enabled: false,
  allowedDomains: ["localhost", "127.0.0.1"],
  maxScreenshotSize: 5 * 1024 * 1024, // 5MB
  maxSessionDuration: 5 * 60 * 1000, // 5 minutes
  defaultViewport: { width: 1280, height: 720 },
};

/**
 * Validate if a URL is allowed based on the config
 */
export function isUrlAllowed(url: string, config: BrowserConfig): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    return config.allowedDomains.some((domain) => {
      if (domain === hostname) return true;
      if (domain.startsWith("*.")) {
        const baseDomain = domain.slice(2);
        return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
      }
      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Browser instructions for agent system prompt
 */
export const browserInstructions = `
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
