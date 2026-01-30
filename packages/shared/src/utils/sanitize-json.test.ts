import { describe, it, expect } from "vitest";
import { sanitizeForJson } from "./sanitize-json";

describe("sanitizeForJson", () => {
  it("should remove null bytes from strings", () => {
    const input = "Hello\x00World";
    const expected = "HelloWorld";
    expect(sanitizeForJson(input)).toBe(expected);
  });

  it("should keep valid control characters (tab, newline, carriage return)", () => {
    const input = "Hello\tWorld\nNew Line\rCarriage Return";
    expect(sanitizeForJson(input)).toBe(input);
  });

  it("should remove other control characters", () => {
    const input =
      "Hello\x01\x02\x03\x04\x05\x06\x07\x08\x0B\x0C\x0E\x0F\x10World";
    const expected = "HelloWorld";
    expect(sanitizeForJson(input)).toBe(expected);
  });

  it("should not remove valid ANSI escape codes", () => {
    const input =
      "\u001b[30m 30 \u001b[0m\u001b[31m 31 \u001b[0m\u001b[32m 32 \u001b[0m\u001b[33m 33 \u001b[0m\u001b[34m 34 \u001b[0m\u001b[35m 35 \u001b[0m\u001b[36m 36 \u001b[0m\u001b[37m 37 \u001b[0m\n";
    expect(sanitizeForJson(input)).toBe(input);
  });

  it("should sanitize strings in arrays", () => {
    const input = ["Hello", "World\x00", "Test\x01"];
    const expected = ["Hello", "World", "Test"];
    expect(sanitizeForJson(input)).toEqual(expected);
  });

  it("should sanitize strings in objects", () => {
    const input = {
      name: "Test\x00",
      value: "Hello\x01World",
      nested: {
        field: "Nested\x02Value",
      },
    };
    const expected = {
      name: "Test",
      value: "HelloWorld",
      nested: {
        field: "NestedValue",
      },
    };
    expect(sanitizeForJson(input)).toEqual(expected);
  });

  it("should handle complex nested structures", () => {
    const input = {
      messages: [
        {
          type: "tool-result",
          result: "Command output\x00with null byte",
          parts: [{ text: "Some\x01text" }, { text: "More\x00text\x02here" }],
        },
      ],
    };
    const expected = {
      messages: [
        {
          type: "tool-result",
          result: "Command outputwith null byte",
          parts: [{ text: "Sometext" }, { text: "Moretexthere" }],
        },
      ],
    };
    expect(sanitizeForJson(input)).toEqual(expected);
  });

  it("should leave non-string values unchanged", () => {
    expect(sanitizeForJson(123)).toBe(123);
    expect(sanitizeForJson(true)).toBe(true);
    expect(sanitizeForJson(null)).toBe(null);
    expect(sanitizeForJson(undefined)).toBe(undefined);
  });

  it("should handle empty values", () => {
    expect(sanitizeForJson("")).toBe("");
    expect(sanitizeForJson([])).toEqual([]);
    expect(sanitizeForJson({})).toEqual({});
  });

  it("should replace unpaired high surrogates with replacement character", () => {
    const input = "Test \uD83D emoji"; // High surrogate without low surrogate
    const expected = "Test \uFFFD emoji";
    expect(sanitizeForJson(input)).toBe(expected);
  });

  it("should replace unpaired low surrogates with replacement character", () => {
    const input = "Test \uDE00 emoji"; // Low surrogate without high surrogate
    const expected = "Test \uFFFD emoji";
    expect(sanitizeForJson(input)).toBe(expected);
  });

  it("should keep valid surrogate pairs intact", () => {
    const input = "Test \uD83D\uDE00 emoji"; // Valid surrogate pair (😀)
    expect(sanitizeForJson(input)).toBe(input);
  });

  it("should handle multiple invalid surrogates", () => {
    const input = "Icon: \uD83D... then \uDE00 and valid \uD83D\uDE00";
    const expected = "Icon: \uFFFD... then \uFFFD and valid \uD83D\uDE00";
    expect(sanitizeForJson(input)).toBe(expected);
  });

  it("should sanitize invalid surrogates in nested structures", () => {
    const input = {
      message: "Error with \uD83D icon",
      details: {
        items: ["Item \uDE00 one", "Valid \uD83D\uDE00 emoji"],
      },
    };
    const expected = {
      message: "Error with \uFFFD icon",
      details: {
        items: ["Item \uFFFD one", "Valid \uD83D\uDE00 emoji"],
      },
    };
    expect(sanitizeForJson(input)).toEqual(expected);
  });

  it("should handle the specific error case from production", () => {
    const input = '<ProblemCard\n                icon="\uD83D....';
    const expected = '<ProblemCard\n                icon="\uFFFD....';
    expect(sanitizeForJson(input)).toBe(expected);
  });
});
