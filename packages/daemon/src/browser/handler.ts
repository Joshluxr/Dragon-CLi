/**
 * Browser Tool Handler
 *
 * Handles browser automation requests from the agent.
 */

import { BrowserSession } from "./session";
import type { BrowserTool, BrowserResult } from "./types";

const sessions: Map<string, BrowserSession> = new Map();

/**
 * Get an existing session or throw if not found
 */
function getSession(threadId: string): BrowserSession {
  const session = sessions.get(threadId);
  if (!session) {
    throw new Error("Browser not launched. Use 'launch' first.");
  }
  return session;
}

/**
 * Handle a browser tool request
 */
export async function handleBrowserTool(
  threadId: string,
  tool: BrowserTool,
): Promise<BrowserResult> {
  try {
    switch (tool.action) {
      case "launch": {
        // Close existing session if any
        const existingSession = sessions.get(threadId);
        if (existingSession) {
          await existingSession.close();
        }

        const session = new BrowserSession();
        await session.launch({
          headless: tool.params.headless,
          viewport: tool.params.viewport,
        });
        sessions.set(threadId, session);
        return { success: true };
      }

      case "navigate": {
        if (!tool.params.url) {
          return { success: false, error: "URL is required for navigate" };
        }
        const session = getSession(threadId);
        await session.navigate(tool.params.url, tool.params.waitUntil);
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
        if (!tool.params.selector) {
          return { success: false, error: "Selector is required for click" };
        }
        const session = getSession(threadId);
        await session.click(tool.params.selector);
        return { success: true };
      }

      case "type": {
        if (!tool.params.selector || !tool.params.text) {
          return {
            success: false,
            error: "Selector and text are required for type",
          };
        }
        const session = getSession(threadId);
        await session.type(
          tool.params.selector,
          tool.params.text,
          tool.params.delay,
        );
        return { success: true };
      }

      case "scroll": {
        if (!tool.params.direction || !tool.params.amount) {
          return {
            success: false,
            error: "Direction and amount are required for scroll",
          };
        }
        const session = getSession(threadId);
        await session.scroll(tool.params.direction, tool.params.amount);
        return { success: true };
      }

      case "get_console": {
        const session = getSession(threadId);
        const logs = session.getConsoleLogs();
        return { success: true, data: { console: logs } };
      }

      case "wait_for": {
        if (!tool.params.selector) {
          return { success: false, error: "Selector is required for wait_for" };
        }
        const session = getSession(threadId);
        await session.waitFor(tool.params.selector, tool.params.timeout);
        return { success: true };
      }

      case "evaluate": {
        if (!tool.params.script) {
          return { success: false, error: "Script is required for evaluate" };
        }
        const session = getSession(threadId);
        const result = await session.evaluate(tool.params.script);
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
        return {
          success: false,
          error: `Unknown action: ${(tool as BrowserTool).action}`,
        };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Close all browser sessions (for cleanup)
 */
export async function closeAllBrowserSessions(): Promise<void> {
  for (const [threadId, session] of sessions) {
    try {
      await session.close();
    } catch {
      // Ignore errors during cleanup
    }
    sessions.delete(threadId);
  }
}

/**
 * Close a specific browser session
 */
export async function closeBrowserSession(threadId: string): Promise<void> {
  const session = sessions.get(threadId);
  if (session) {
    await session.close();
    sessions.delete(threadId);
  }
}
