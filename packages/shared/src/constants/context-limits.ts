/**
 * Maximum context tokens for Claude models
 * This is used to determine when to auto-compact and show warnings
 */
export const MAX_CONTEXT_TOKENS = 140000;

/**
 * Percentage threshold for showing context warning
 * Warning is shown when context remaining is below this percentage
 */
export const CONTEXT_WARNING_PERCENTAGE = 30;
