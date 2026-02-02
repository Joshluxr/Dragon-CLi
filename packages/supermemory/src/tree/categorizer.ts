/**
 * Memory Categorizer
 *
 * Automatically categorizes memories into the tree structure.
 * Uses heuristics + optional LLM classification.
 */

/**
 * Categorization result for a memory item.
 */
export interface CategorizationResult {
  category: "session" | "pattern" | "decision" | "context" | "observation";
  sessionId?: string;
  confidence: number;
  tags: string[];
  relevanceHints: string[];
}

/**
 * Decision indicator patterns.
 */
const DECISION_PATTERNS = [
  /\b(decided|chose|selected|picked|opted)\s+(to|for)\b/i,
  /\b(will use|using|went with)\s+\w+\s+(for|because|since)\b/i,
  /\b(approach|solution|strategy)\s+(is|will be)\b/i,
  /\b(instead of|rather than|over)\b/i,
  /\bchose\s+\w+\s+over\b/i,
];

/**
 * Pattern indicator patterns (meta-learning).
 */
const PATTERN_PATTERNS = [
  /\b(always|usually|typically|generally|prefer)\b/i,
  /\b(convention|standard|practice|pattern)\b/i,
  /\b(should|must)\s+(always|never)\b/i,
  /\bthis\s+(project|codebase|repo)\s+(uses|follows|prefers)\b/i,
];

/**
 * Context/static info patterns.
 */
const CONTEXT_PATTERNS = [
  /\b(project|repository|codebase|workspace)\s+(structure|architecture|overview)\b/i,
  /\b(tech\s*stack|dependencies|requirements)\b/i,
  /\b(configured|setup|initialized)\s+(with|using)\b/i,
  /\bproject\s+(uses|is\s+built\s+with)\b/i,
];

/**
 * Technology extraction patterns.
 */
const TECH_PATTERNS = [
  // Frontend frameworks
  /\b(React|Vue|Angular|Svelte|Next\.?js|Nuxt|Remix|Astro)\b/gi,
  // Languages
  /\b(TypeScript|JavaScript|Python|Rust|Go|Java|C\+\+|Ruby|PHP)\b/gi,
  // Databases
  /\b(PostgreSQL|MySQL|MongoDB|Redis|SQLite|Drizzle|Prisma|Supabase)\b/gi,
  // Styling
  /\b(Tailwind|CSS|SCSS|Sass|styled-components|Emotion)\b/gi,
  // APIs
  /\b(REST|GraphQL|gRPC|WebSocket|tRPC)\b/gi,
  // Tools
  /\b(Docker|Kubernetes|Vercel|AWS|GCP|Cloudflare)\b/gi,
  // Testing
  /\b(Jest|Vitest|Playwright|Cypress|Testing Library)\b/gi,
];

/**
 * Action keywords for relevance hints.
 */
const ACTION_PATTERNS = [
  /\b(implement|create|build|add|remove|delete|update|fix|refactor)\b/gi,
  /\b(authentication|authorization|auth|login|signup)\b/gi,
  /\b(database|schema|migration|model)\b/gi,
  /\b(api|endpoint|route|handler)\b/gi,
  /\b(component|page|layout|hook)\b/gi,
  /\b(test|spec|coverage)\b/gi,
  /\b(deploy|build|ci|cd|pipeline)\b/gi,
  /\b(error|bug|issue|fix)\b/gi,
];

/**
 * Categorizes a memory based on its content and type.
 */
export function categorizeMemory(
  content: string,
  type?: string,
  sessionId?: string,
): CategorizationResult {
  const tags = extractTags(content);
  const relevanceHints = extractRelevanceHints(content);

  // Explicit type takes precedence
  if (type === "decision" || type === "pattern" || type === "context") {
    return {
      category: type,
      sessionId,
      confidence: 0.95,
      tags,
      relevanceHints,
    };
  }

  // Check for decision patterns
  for (const pattern of DECISION_PATTERNS) {
    if (pattern.test(content)) {
      return {
        category: "decision",
        sessionId,
        confidence: 0.8,
        tags,
        relevanceHints,
      };
    }
  }

  // Check for pattern patterns
  for (const pattern of PATTERN_PATTERNS) {
    if (pattern.test(content)) {
      return {
        category: "pattern",
        sessionId,
        confidence: 0.75,
        tags,
        relevanceHints,
      };
    }
  }

  // Check for context patterns
  for (const pattern of CONTEXT_PATTERNS) {
    if (pattern.test(content)) {
      return {
        category: "context",
        sessionId,
        confidence: 0.7,
        tags,
        relevanceHints,
      };
    }
  }

  // Tool observations
  if (type === "tool-observation" || type === "observation") {
    return {
      category: "observation",
      sessionId,
      confidence: 0.9,
      tags,
      relevanceHints,
    };
  }

  // Default to session
  return {
    category: "session",
    sessionId,
    confidence: 0.5,
    tags,
    relevanceHints,
  };
}

/**
 * Extracts technology and concept tags from content.
 */
export function extractTags(content: string): string[] {
  const tags = new Set<string>();

  for (const pattern of TECH_PATTERNS) {
    const matches = content.match(pattern) || [];
    for (const match of matches) {
      tags.add(match.toLowerCase());
    }
  }

  return [...tags].slice(0, 15);
}

/**
 * Extracts relevance hints (action keywords) from content.
 */
export function extractRelevanceHints(content: string): string[] {
  const hints = new Set<string>();

  for (const pattern of ACTION_PATTERNS) {
    const matches = content.match(pattern) || [];
    for (const match of matches) {
      hints.add(match.toLowerCase());
    }
  }

  return [...hints].slice(0, 10);
}

/**
 * Generates a brief summary for a memory.
 * Uses heuristics; can be enhanced with LLM.
 */
export function generateMemorySummary(
  content: string,
  maxLength: number = 100,
): string {
  // Take first sentence or truncate
  const firstSentence = content.match(/^[^.!?\n]+[.!?]?/)?.[0] || content;

  if (firstSentence.length <= maxLength) {
    return firstSentence.trim();
  }

  // Find a good break point
  const truncated = firstSentence.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > maxLength * 0.5) {
    return truncated.substring(0, lastSpace) + "...";
  }

  return truncated + "...";
}

/**
 * Extracts session title from memories.
 */
export function extractSessionTitle(
  memories: Array<{ content: string; metadata?: { type?: string } }>,
): string {
  // Look for user prompt to understand intent
  const userPrompt = memories.find((m) => m.metadata?.type === "user-prompt");
  if (userPrompt) {
    return generateMemorySummary(userPrompt.content, 50);
  }

  // Look for session summary
  const summary = memories.find((m) => m.metadata?.type === "session-summary");
  if (summary) {
    return generateMemorySummary(summary.content, 50);
  }

  // Fall back to first memory
  if (memories.length > 0 && memories[0]) {
    return generateMemorySummary(memories[0].content, 50);
  }

  return "Unknown session";
}
