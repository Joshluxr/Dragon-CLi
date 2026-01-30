export type ParsedEnvVariable = {
  key: string;
  value: string;
};

export type ParseEnvFileResult = {
  variables: ParsedEnvVariable[];
  errors: string[];
};

/**
 * Parses .env file content into key-value pairs
 * Supports:
 * - Basic KEY=value format
 * - Quoted values (single and double quotes)
 * - Multiline values with quotes
 * - Comments (lines starting with #)
 * - Empty lines
 */
export function parseEnvFile(content: string): ParseEnvFileResult {
  const lines = content.split("\n");
  const variables: ParsedEnvVariable[] = [];
  const errors: string[] = [];
  const seenKeys = new Set<string>();

  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let inMultilineValue = false;
  let multilineQuoteChar: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Handle multiline values
    if (inMultilineValue && currentKey && multilineQuoteChar) {
      const endQuoteIndex = line ? line.lastIndexOf(multilineQuoteChar) : -1;
      if (endQuoteIndex !== -1 && line) {
        // End of multiline value
        currentValue.push(line.substring(0, endQuoteIndex));
        const value = currentValue.join("\n");

        if (seenKeys.has(currentKey)) {
          errors.push(`Line ${lineNumber}: Duplicate key "${currentKey}"`);
        } else {
          variables.push({ key: currentKey, value });
          seenKeys.add(currentKey);
        }

        currentKey = null;
        currentValue = [];
        inMultilineValue = false;
        multilineQuoteChar = null;
      } else {
        // Continue multiline value
        currentValue.push(line || "");
      }
      continue;
    }

    // Skip empty lines and comments
    const trimmed = line ? line.trim() : "";
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const cleanLine = trimmed;

    // Find the first = sign
    const equalsIndex = cleanLine.indexOf("=");
    if (equalsIndex === -1) {
      errors.push(`Line ${lineNumber}: Invalid format, missing '=' sign`);
      continue;
    }

    const key = cleanLine.substring(0, equalsIndex).trim();
    const rawValue = cleanLine.substring(equalsIndex + 1);

    // Validate key
    if (!key) {
      errors.push(`Line ${lineNumber}: Empty key`);
      continue;
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push(
        `Line ${lineNumber}: Invalid key "${key}" - must start with a letter or underscore and contain only letters, numbers, and underscores`,
      );
      continue;
    }

    // Parse value
    let value = rawValue;

    // Handle quoted values
    if (
      (rawValue.startsWith('"') || rawValue.startsWith("'")) &&
      rawValue.length > 1
    ) {
      const quoteChar = rawValue[0] as string;
      const endQuoteIndex = rawValue.lastIndexOf(quoteChar);

      if (endQuoteIndex === 0) {
        // Start of multiline value
        currentKey = key;
        currentValue = [rawValue.substring(1)];
        inMultilineValue = true;
        multilineQuoteChar = quoteChar;
        continue;
      } else {
        // Single line quoted value
        value = rawValue.substring(1, endQuoteIndex);

        // Handle escape sequences in double quotes
        if (quoteChar === '"') {
          value = value
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
            .replace(/\\\\/g, "\\")
            .replace(/\\"/g, '"');
        }
      }
    } else {
      // Unquoted value - trim whitespace
      value = value.trim();

      // Remove trailing comment if present
      const commentIndex = value.indexOf(" #");
      if (commentIndex !== -1) {
        value = value.substring(0, commentIndex).trim();
      }
    }

    // Add the variable
    if (seenKeys.has(key)) {
      errors.push(`Line ${lineNumber}: Duplicate key "${key}"`);
    } else {
      variables.push({ key, value });
      seenKeys.add(key);
    }
  }

  // Check for unclosed multiline value
  if (inMultilineValue && currentKey) {
    errors.push(`Unclosed multiline value for key "${currentKey}"`);
  }

  return { variables, errors };
}
