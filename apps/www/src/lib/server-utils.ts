import { env } from "@dragon/env/apps-www";
import { publicAppUrl } from "@dragon/env/next-public";

/**
 * There are some cases where we need a URL that isn't the localhost one,
 * eg. When the daemon needs to connect back to the local server
 * eg. OAuth redirection urls that don't support localhost
 *
 * In cases where localhost is fine, publicAppUrl() is preferred because the user
 * is likely authed in their browser to localhost and not the non-localhost URL.
 */
export function nonLocalhostPublicAppUrl() {
  if (process.env.NODE_ENV === "development") {
    // Deprecated, use LOCALHOST_PUBLIC_DOMAIN instead
    if (env.NGROK_DOMAIN) {
      return `https://${env.NGROK_DOMAIN}`;
    }
    if (env.LOCALHOST_PUBLIC_DOMAIN) {
      // If LOCALHOST_PUBLIC_DOMAIN already has a protocol, use it as-is
      if (
        env.LOCALHOST_PUBLIC_DOMAIN.startsWith("http://") ||
        env.LOCALHOST_PUBLIC_DOMAIN.startsWith("https://")
      ) {
        return env.LOCALHOST_PUBLIC_DOMAIN;
      }
      return `https://${env.LOCALHOST_PUBLIC_DOMAIN}`;
    }
    // Fallback to localhost for local development (OAuth callbacks won't work without a public domain)
    return "http://localhost:3000";
  }
  if (process.env.NODE_ENV === "test") {
    return process.env.NEXT_PUBLIC_APP_URL!;
  }
  return publicAppUrl();
}
