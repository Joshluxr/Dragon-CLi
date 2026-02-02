/**
 * Privacy Filter Utilities
 *
 * Filters sensitive content before storing in memory.
 * Supports explicit privacy tags and auto-detection of secrets.
 */

/**
 * Privacy tag patterns to detect and filter.
 */
const PRIVACY_PATTERNS = [
  /<private>[\s\S]*?<\/private>/gi,
  /<secret>[\s\S]*?<\/secret>/gi,
  /<sensitive>[\s\S]*?<\/sensitive>/gi,
  /<redact>[\s\S]*?<\/redact>/gi,
];

/**
 * Common secret patterns (high confidence).
 */
const SECRET_PATTERNS = [
  // API keys with common prefixes
  /\b(sk|pk|api|key|token|secret|bearer)[-_]?[a-zA-Z0-9]{20,}/gi,
  // AWS keys
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b[A-Za-z0-9/+=]{40}\b/g, // AWS secret (preceded by AKIA check)
  // GitHub tokens
  /\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/g,
  // Generic long secrets
  /['"][a-zA-Z0-9_-]{32,}['"]/g,
];

/**
 * Environment variable patterns (medium confidence - warn only).
 */
const ENV_PATTERNS = [
  /^[A-Z][A-Z0-9_]*=.+$/gm,
  /\b(DATABASE_URL|REDIS_URL|MONGODB_URI)\s*=\s*['"]?[^\s'"]+/gi,
  /\b(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=\s*['"]?[^\s'"]+/gi,
  /\b(GITHUB_TOKEN|GH_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY)\s*=\s*['"]?[^\s'"]+/gi,
];

export interface PrivacyFilterResult {
  filtered: string;
  removedCount: number;
  warnings: string[];
  hasSecrets: boolean;
}

/**
 * Filters private content from text before storing in memory.
 */
export function filterPrivateContent(text: string): PrivacyFilterResult {
  let filtered = text;
  let removedCount = 0;
  const warnings: string[] = [];
  let hasSecrets = false;

  // 1. Remove explicit privacy tags
  for (const pattern of PRIVACY_PATTERNS) {
    const matches = filtered.match(pattern) || [];
    removedCount += matches.length;
    filtered = filtered.replace(pattern, "[REDACTED]");
  }

  // 2. Detect and redact high-confidence secrets
  for (const pattern of SECRET_PATTERNS) {
    const matches = filtered.match(pattern) || [];
    if (matches.length > 0) {
      hasSecrets = true;
      removedCount += matches.length;
      filtered = filtered.replace(pattern, "[SECRET_REDACTED]");
    }
  }

  // 3. Warn about potential env vars (don't auto-redact)
  for (const pattern of ENV_PATTERNS) {
    if (pattern.test(text)) {
      warnings.push(
        "Detected potential environment variables or credentials. Consider using <private> tags.",
      );
      break;
    }
  }

  return { filtered, removedCount, warnings, hasSecrets };
}

/**
 * Checks if content should be stored at all.
 */
export function shouldStore(content: string): boolean {
  // Skip entirely if marked with <private store="false">
  if (/<private\s+store\s*=\s*["']?false["']?\s*>/i.test(content)) {
    return false;
  }

  // Skip if entire content is private
  if (/^<private>[\s\S]*<\/private>$/i.test(content.trim())) {
    return false;
  }

  // Skip very short content (likely not useful)
  if (content.trim().length < 20) {
    return false;
  }

  // Skip if it's just whitespace or common noise
  if (/^[\s\n\r\t]*$/.test(content)) {
    return false;
  }

  return true;
}

/**
 * Masks a portion of text for display (e.g., showing first/last chars).
 */
export function maskSensitive(text: string, showChars: number = 4): string {
  if (text.length <= showChars * 2) {
    return "*".repeat(text.length);
  }
  const start = text.substring(0, showChars);
  const end = text.substring(text.length - showChars);
  const middle = "*".repeat(Math.min(text.length - showChars * 2, 8));
  return `${start}${middle}${end}`;
}

/**
 * Checks if content contains any known secrets.
 */
export function containsSecrets(content: string): boolean {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }
  return false;
}
