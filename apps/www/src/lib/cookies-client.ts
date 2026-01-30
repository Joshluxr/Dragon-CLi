import { COOKIE_MAX_AGE_SECS } from "@/lib/cookies";

export function getCookieOrNull(name: string) {
  if (typeof document === "undefined") {
    return null;
  }
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    const value = parts.pop()?.split(";").shift();
    if (value) {
      try {
        // Try to decode URI component first in case it's URL-encoded
        const decodedValue = decodeURIComponent(value);
        return JSON.parse(decodedValue);
      } catch (error) {
        // If decoding fails, try parsing the raw value
        try {
          return JSON.parse(value);
        } catch (parseError) {
          console.error("Failed to parse cookie item:", parseError);
        }
      }
    }
  }
  return null;
}

export function setCookie({
  maxAgeSecs = COOKIE_MAX_AGE_SECS,
  key,
  value,
}: {
  key: string;
  value: string;
  maxAgeSecs?: number;
}) {
  // Set cookie with 1 year expiration
  const date = new Date();
  date.setTime(date.getTime() + maxAgeSecs * 1000);
  document.cookie = `${key}=${value}; path=/; expires=${date.toUTCString()}`;
}

export function deleteCookie(key: string) {
  document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
