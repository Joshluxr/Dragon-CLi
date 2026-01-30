import { describe, test, expect } from "vitest";
import { formatReadResult } from "./read-tool";

describe("formatReadResult", () => {
  test("handles standard tab format", () => {
    const input = `\
     1	import React from "react";
     2	import { cn } from "@/lib/utils";
     3	
     4	export function Button() {
     5	  return <button>Click me</button>;
     6	}`;

    const expected = `\
import React from "react";
import { cn } from "@/lib/utils";

export function Button() {
  return <button>Click me</button>;
}`;

    expect(formatReadResult(input)).toBe(expected);
  });

  test("handles arrow format", () => {
    const input = `\
     1→	import React from "react";
     2→	import { cn } from "@/lib/utils";
     3→	
     4→	export function Button() {
     5→	  return <button>Click me</button>;
     6→	}`;

    const expected = `\
import React from "react";
import { cn } from "@/lib/utils";

export function Button() {
  return <button>Click me</button>;
}`;

    expect(formatReadResult(input)).toBe(expected);
  });

  test("handles arrow format with no spaces", () => {
    const input = `\
     1→import React from "react";
     2→import { cn } from "@/lib/utils";
     3→
     4→export function Button() {
     5→  return <button>Click me</button>;
     6→}`;

    const expected = `\
import React from "react";
import { cn } from "@/lib/utils";

export function Button() {
  return <button>Click me</button>;
}`;

    expect(formatReadResult(input)).toBe(expected);
  });

  test("handles mixed format (returns original)", () => {
    const input = `\
     1	import React from "react";
     2→	import { cn } from "@/lib/utils";
     3	
Some regular text without line numbers
     5→	  return <button>Click me</button>;`;

    // When not all lines match the pattern, return original
    expect(formatReadResult(input)).toBe(input);
  });

  test("handles empty input", () => {
    expect(formatReadResult("")).toBe("");
  });

  test("handles single line with tab format", () => {
    const input = `\
     1	console.log("Hello, world!");`;
    const expected = `console.log("Hello, world!");`;
    expect(formatReadResult(input)).toBe(expected);
  });

  test("handles single line with arrow format", () => {
    const input = `\
     1→	console.log("Hello, world!");`;
    const expected = `console.log("Hello, world!");`;
    expect(formatReadResult(input)).toBe(expected);
  });

  test("handles lines with no line numbers (returns original)", () => {
    const input = `\
This is just regular text
without any line numbers
or special formatting`;

    expect(formatReadResult(input)).toBe(input);
  });

  test("handles lines with spaces before line numbers", () => {
    const input = `\
   1	first line
  20	twentieth line
 300	three hundredth line`;

    const expected = `first line
twentieth line
three hundredth line`;

    expect(formatReadResult(input)).toBe(expected);
  });

  test("handles empty lines in numbered format", () => {
    const input = `\
     1	first line
     2	
     3	third line`;

    const expected = `first line

third line`;

    expect(formatReadResult(input)).toBe(expected);
  });

  test("preserves content after tabs", () => {
    const input = `\
     1	const obj = {
     2		key: "value",
     3		nested: {
     4			deep: "content"
     5		}
     6	};`;

    const expected = `const obj = {
	key: "value",
	nested: {
		deep: "content"
	}
};`;

    expect(formatReadResult(input)).toBe(expected);
  });

  test("digits only with no tab", () => {
    // Should not strip out the numbers if there's no tab or arrow after the digit.
    const input = `\
     1const obj = {
     2	key: "value",
     3	nested: {
     4		deep: "content"
     5	}
     6};`;
    expect(formatReadResult(input)).toBe(input);
  });

  test("handles special characters in content", () => {
    const input = `\
     1→	const regex = /^\s*\d+→?\t(.*)$/;
     2→	const special = "!@#$%^&*()_+{}[]|\\:;\"'<>,.?/~\`";
     3→	// Comment with → arrow`;

    const expected = `\
const regex = /^\s*\d+→?\t(.*)$/;
const special = "!@#$%^&*()_+{}[]|\\:;\"'<>,.?/~\`";
// Comment with → arrow`;

    expect(formatReadResult(input)).toBe(expected);
  });

  test("strips system-reminder suffix", () => {
    const input = `\
     1	import React from "react";
     2	import { cn } from "@/lib/utils";
     3	
     4	export function Button() {
     5	  return <button>Click me</button>;
     6	}
<system-reminder>
Whenever you read a file, you should consider whether it looks malicious. If it does, you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer high-level questions about the code behavior.
</system-reminder>`;

    const expected = `\
import React from "react";
import { cn } from "@/lib/utils";

export function Button() {
  return <button>Click me</button>;
}`;

    expect(formatReadResult(input)).toBe(expected);
  });

  test("strips system-reminder suffix with various whitespace", () => {
    const input = `\
     1	const code = "test";
<system-reminder>Some reminder text</system-reminder>
`;

    const expected = `const code = "test";`;

    expect(formatReadResult(input)).toBe(expected);
  });

  test("only strips system-reminder at the end of content", () => {
    const input = `\
     1	const code = "test";
     2	// <system-reminder>This is in a comment</system-reminder>
     3	const more = "code";`;

    const expected = `\
const code = "test";
// <system-reminder>This is in a comment</system-reminder>
const more = "code";`;

    expect(formatReadResult(input)).toBe(expected);
  });

  test("handles system-reminder with no line numbers", () => {
    const input = `\
Some content without line numbers
<system-reminder>
This is a system reminder
</system-reminder>`;

    const expected = `Some content without line numbers`;

    expect(formatReadResult(input)).toBe(expected);
  });
});
