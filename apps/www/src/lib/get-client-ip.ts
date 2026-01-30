import { headers } from "next/headers";

/**
 * Extracts the client IP address from request headers.
 *
 * SECURITY CONSIDERATIONS:
 * - In production on Vercel, we trust the x-forwarded-for header as it's set by Vercel's edge network
 * - In other environments, headers can be spoofed by clients
 * - Always deploy behind a trusted reverse proxy in production
 * - Private/local IPs are filtered out to prevent bypassing rate limits
 *
 * @returns The client's IP address or "127.0.0.1" as fallback
 */
export async function getClientIP(): Promise<string> {
  const headersList = await headers();

  // In production on Vercel, we can trust x-forwarded-for header
  // as it's set by Vercel's edge network and cannot be spoofed by clients
  if (process.env.VERCEL) {
    // On Vercel, x-forwarded-for is guaranteed to be set by the platform
    // The first IP in the list is the original client IP
    const forwardedFor = headersList.get("x-forwarded-for");
    if (forwardedFor) {
      const ip = forwardedFor.split(",")[0]?.trim();
      if (ip && isValidIP(ip)) {
        return ip;
      }
    }
  }

  // For other environments (development, self-hosted), we check multiple headers
  // but understand these can be spoofed. In production, always use a trusted proxy.
  const ipHeaders = [
    "x-real-ip",
    "cf-connecting-ip", // Cloudflare
    "x-forwarded-for",
    "x-client-ip",
    "x-forwarded",
    "forwarded-for",
    "forwarded",
  ];

  for (const header of ipHeaders) {
    const value = headersList.get(header);
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ip = value.split(",")[0]?.trim();
      if (ip && isValidIP(ip)) {
        return ip;
      }
    }
  }

  // Fallback to a default IP for development/local testing
  return "127.0.0.1";
}

function isValidIP(ip: string): boolean {
  // Validate IPv4 address
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  // More comprehensive IPv6 validation that handles compressed forms
  const ipv6Regex =
    /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  // Exclude private/local IPs from being valid for rate limiting purposes
  const privateIPv4Regex =
    /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/;

  if (ipv4Regex.test(ip)) {
    // Don't treat private IPs as valid for rate limiting
    return !privateIPv4Regex.test(ip);
  }

  return ipv6Regex.test(ip);
}
