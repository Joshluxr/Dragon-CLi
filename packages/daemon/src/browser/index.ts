/**
 * Browser Automation Module
 *
 * Exports browser automation functionality for the daemon.
 */

export { BrowserSession } from "./session";
export {
  handleBrowserTool,
  closeAllBrowserSessions,
  closeBrowserSession,
} from "./handler";
export type * from "./types";
