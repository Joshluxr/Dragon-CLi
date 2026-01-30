/**
 * Format an error as a detailed JSON string.
 * Useful for logging errors with full context.
 *
 * @param error - The error to format
 * @returns JSON string with error details
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify(
      {
        name: error.name,
        message: error.message,
        ...(error.cause ? { cause: error.cause } : {}),
      },
      null,
      2,
    );
  }
  return String(error);
}

/**
 * Extract the error message from an unknown error.
 * Useful for displaying error messages to users or in logs.
 *
 * @param error - The error to extract the message from
 * @returns The error message as a string
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   console.error(`Operation failed: ${getErrorMessage(error)}`);
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
