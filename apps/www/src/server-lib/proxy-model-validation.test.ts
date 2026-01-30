import { describe, it, expect } from "vitest";
import { validateProxyRequestModel } from "./proxy-model-validation";
import { NextRequest } from "next/server";

describe("validateProxyRequestModel", () => {
  it("should validate a valid openrouter model", async () => {
    const request = new NextRequest("https://example.com", {
      method: "POST",
    });
    const body = JSON.stringify({ model: "google/gemini-2.5-pro" });
    const bodyBuffer = new TextEncoder().encode(body).buffer;
    const result = await validateProxyRequestModel({
      request,
      provider: "openrouter",
      bodyBuffer,
    });
    expect(result).toEqual({ valid: true });
  });

  it("should reject an invalid openrouter model", async () => {
    const request = new NextRequest("https://example.com", {
      method: "POST",
    });
    const body = JSON.stringify({ model: "invalid/model" });
    const bodyBuffer = new TextEncoder().encode(body).buffer;
    const result = await validateProxyRequestModel({
      request,
      provider: "openrouter",
      bodyBuffer,
    });
    expect(result).toEqual({
      valid: false,
      error: "Invalid model requested: invalid/model",
    });
  });
});
