import { describe, it, expect } from "vitest";
import { parseEnvFile } from "./parse-env-file";

describe("parseEnvFile", () => {
  it("parses basic key-value pairs", () => {
    const content = `
KEY1=value1
KEY2=value2
KEY3=value3
`;
    const result = parseEnvFile(content);
    expect(result.errors).toHaveLength(0);
    expect(result.variables).toEqual([
      { key: "KEY1", value: "value1" },
      { key: "KEY2", value: "value2" },
      { key: "KEY3", value: "value3" },
    ]);
  });

  it("handles quoted values", () => {
    const content = `
SINGLE_QUOTED='value with spaces'
DOUBLE_QUOTED="value with spaces"
MIXED_QUOTES="It's a value"
`;
    const result = parseEnvFile(content);
    expect(result.errors).toHaveLength(0);
    expect(result.variables).toEqual([
      { key: "SINGLE_QUOTED", value: "value with spaces" },
      { key: "DOUBLE_QUOTED", value: "value with spaces" },
      { key: "MIXED_QUOTES", value: "It's a value" },
    ]);
  });

  it("handles multiline values", () => {
    const content = `
MULTILINE="line1
line2
line3"
`;
    const result = parseEnvFile(content);
    expect(result.errors).toHaveLength(0);
    expect(result.variables).toEqual([
      { key: "MULTILINE", value: "line1\nline2\nline3" },
    ]);
  });

  it("handles escape sequences in double quotes", () => {
    const content = `
ESCAPED="line1\\nline2\\ttab\\\\backslash\\"quote"
`;
    const result = parseEnvFile(content);
    expect(result.errors).toHaveLength(0);
    expect(result.variables).toEqual([
      { key: "ESCAPED", value: 'line1\nline2\ttab\\backslash"quote' },
    ]);
  });

  it("ignores comments and empty lines", () => {
    const content = `
# This is a comment
KEY1=value1

# Another comment
KEY2=value2
`;
    const result = parseEnvFile(content);
    expect(result.errors).toHaveLength(0);
    expect(result.variables).toEqual([
      { key: "KEY1", value: "value1" },
      { key: "KEY2", value: "value2" },
    ]);
  });

  it("handles inline comments", () => {
    const content = `
KEY1=value1 # This is an inline comment
KEY2=value2 # Another comment
`;
    const result = parseEnvFile(content);
    expect(result.errors).toHaveLength(0);
    expect(result.variables).toEqual([
      { key: "KEY1", value: "value1" },
      { key: "KEY2", value: "value2" },
    ]);
  });

  it("validates key format", () => {
    const content = `
VALID_KEY=value
123INVALID=value
invalid-key=value
invalid key=value
`;
    const result = parseEnvFile(content);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toContain('Invalid key "123INVALID"');
    expect(result.errors[1]).toContain('Invalid key "invalid-key"');
    expect(result.errors[2]).toContain('Invalid key "invalid key"');
    expect(result.variables).toEqual([{ key: "VALID_KEY", value: "value" }]);
  });

  it("detects duplicate keys", () => {
    const content = `
KEY1=value1
KEY2=value2
KEY1=value3
`;
    const result = parseEnvFile(content);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Duplicate key "KEY1"');
    expect(result.variables).toEqual([
      { key: "KEY1", value: "value1" },
      { key: "KEY2", value: "value2" },
    ]);
  });

  it("handles empty values", () => {
    const content = `
EMPTY=
EMPTY_QUOTED=""
`;
    const result = parseEnvFile(content);
    expect(result.errors).toHaveLength(0);
    expect(result.variables).toEqual([
      { key: "EMPTY", value: "" },
      { key: "EMPTY_QUOTED", value: "" },
    ]);
  });

  it("handles complex real-world example", () => {
    const content = `
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
REDIS_URL=redis://localhost:6379

# API Keys
API_KEY="sk-1234567890abcdef"
SECRET_KEY='super-secret-key-with-special-chars!@#$%'

# Feature Flags
ENABLE_FEATURE_A=true
ENABLE_FEATURE_B=false

# Multiline Certificate
SSL_CERT="-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKl2b
... certificate content ...
-----END CERTIFICATE-----"

# Application Settings
NODE_ENV=production
PORT=3000
LOG_LEVEL=debug # Can be: debug, info, warn, error
`;
    const result = parseEnvFile(content);
    expect(result.errors).toHaveLength(0);
    expect(result.variables).toHaveLength(10);
    expect(result.variables[0]).toEqual({
      key: "DATABASE_URL",
      value: "postgresql://user:password@localhost:5432/mydb",
    });
    expect(result.variables[3]).toEqual({
      key: "SECRET_KEY",
      value: "super-secret-key-with-special-chars!@#$%",
    });
    expect(result.variables[6]).toEqual({
      key: "SSL_CERT",
      value:
        "-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIJAKl2b\n... certificate content ...\n-----END CERTIFICATE-----",
    });
    expect(result.variables[9]).toEqual({
      key: "LOG_LEVEL",
      value: "debug",
    });
  });

  it("handles unclosed multiline values", () => {
    const content = `
KEY1=value1
UNCLOSED="This starts but never ends
KEY2=value2
`;
    const result = parseEnvFile(content);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(
      'Unclosed multiline value for key "UNCLOSED"',
    );
    expect(result.variables).toEqual([{ key: "KEY1", value: "value1" }]);
  });
});
