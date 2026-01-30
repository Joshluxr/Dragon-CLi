import { describe, it, expect } from "vitest";
import { renderDockerfile } from "./render-dockerfile";

describe("Dockerfile rendering", () => {
  it("e2b", () => {
    const result = renderDockerfile("e2b");
    expect(result).toMatchSnapshot();
  });

  it("daytona", () => {
    const result = renderDockerfile("daytona");
    expect(result).toMatchSnapshot();
  });
});
