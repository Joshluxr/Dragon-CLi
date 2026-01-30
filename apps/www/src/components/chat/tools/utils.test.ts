import { describe, test, expect } from "vitest";
import { ansiToHtml } from "./utils";

describe("ansiToHtml", () => {
  test("handles plain text without ANSI codes", () => {
    const input = "Hello, world!";
    expect(ansiToHtml(input, "dark")).toMatchInlineSnapshot(`"Hello, world!"`);
  });

  test("converts red ANSI color code to HTML (dark theme)", () => {
    const input = "\x1b[31mRed text\x1b[0m";
    expect(ansiToHtml(input, "dark")).toMatchInlineSnapshot(
      `"<span style="color:#d85e5e">Red text</span>"`,
    );
  });

  test("converts green ANSI color code to HTML (dark theme)", () => {
    const input = "\x1b[32mGreen text\x1b[0m";
    expect(ansiToHtml(input, "dark")).toMatchInlineSnapshot(
      `"<span style="color:#0dbc79">Green text</span>"`,
    );
  });

  test("converts blue ANSI color code to HTML (dark theme)", () => {
    const input = "\x1b[34mBlue text\x1b[0m";
    expect(ansiToHtml(input, "dark")).toMatchInlineSnapshot(
      `"<span style="color:#3c88dc">Blue text</span>"`,
    );
  });

  test("handles multiple colors in one string (dark theme)", () => {
    const input = "\x1b[31mRed\x1b[0m and \x1b[32mGreen\x1b[0m";
    expect(ansiToHtml(input, "dark")).toMatchInlineSnapshot(
      `"<span style="color:#d85e5e">Red</span> and <span style="color:#0dbc79">Green</span>"`,
    );
  });

  test("handles bold text", () => {
    const input = "\x1b[1mBold text\x1b[0m";
    expect(ansiToHtml(input, "dark")).toMatchInlineSnapshot(
      `"<b>Bold text</b>"`,
    );
  });

  test("escapes XML/HTML special characters", () => {
    const input = "<script>alert('xss')</script>";
    expect(ansiToHtml(input, "dark")).toMatchInlineSnapshot(
      `"&lt;script&gt;alert(&apos;xss&apos;)&lt;/script&gt;"`,
    );
  });
});
