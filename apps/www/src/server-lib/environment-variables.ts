import { UserFacingError } from "@/lib/server-actions";

export type EnvironmentVariable = {
  key: string;
  value: string;
};

export async function validateEnvironmentVariables(
  variables: EnvironmentVariable[],
): Promise<void> {
  // Validate all keys are valid environment variable names
  for (const variable of variables) {
    if (!variable.key.trim()) {
      throw new UserFacingError("Environment variable keys cannot be empty");
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.key)) {
      throw new UserFacingError(
        `Invalid environment variable key: ${variable.key}`,
      );
    }
  }
  // Check for duplicate keys
  const keys = new Set<string>();
  for (const variable of variables) {
    if (keys.has(variable.key)) {
      throw new UserFacingError(
        `Duplicate environment variable key: ${variable.key}`,
      );
    }
    keys.add(variable.key);
  }
}
