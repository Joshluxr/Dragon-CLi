/**
 * Sanitizes a value to ensure it can be safely stored as JSON in PostgreSQL.
 * Removes null bytes, invalid Unicode surrogate pairs, and other invalid characters
 * that would cause JSON parsing errors.
 *
 * See also: https://leosjoberg.com/blog/handling-null-bytes-json-payloads-postgres/
 */
export function sanitizeForJson<T>(value: T): T {
  if (typeof value === "string") {
    // Remove null bytes and other control characters that are invalid in JSON
    // Keep tab (\t), newline (\n), carriage return (\r), and ESC (\x1B for ANSI codes)
    let sanitized = value.replace(
      /[\x00-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F\x7F]/g,
      "",
    );

    // Fix invalid Unicode surrogate pairs
    // Replace unpaired surrogates with replacement character
    sanitized = sanitized.replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      "\uFFFD",
    );

    return sanitized as T;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForJson) as T;
  }
  if (value !== null && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeForJson(val);
    }
    return sanitized as T;
  }
  return value;
}
