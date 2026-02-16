import type { SandboxProvider } from "@dragon/types/sandbox";
import type { ISandboxProvider } from "./types";
import { DockerProvider } from "./providers/docker-provider";
import { E2BProvider } from "./providers/e2b-provider";
import { MockProvider } from "./providers/mock-provider";
import { DaytonaProvider } from "./providers/daytona-provider";

export function getSandboxProvider(
  provider: SandboxProvider,
): ISandboxProvider {
  switch (provider) {
    case "e2b":
      return new E2BProvider();
    case "mock":
      if (process.env.NODE_ENV === "test") {
        return new MockProvider();
      }
      throw new Error(
        "Mock sandbox provider is only available in test environments",
      );
    case "docker":
      if (
        process.env.NODE_ENV === "test" ||
        process.env.NODE_ENV === "development" ||
        process.env.DOCKER_HOST
      ) {
        return new DockerProvider();
      }
      throw new Error(
        "Docker sandbox provider requires DOCKER_HOST in production (e.g. ssh://root@sandbox-server)",
      );
    case "daytona":
      return new DaytonaProvider();
    default:
      const _exhaustiveCheck: never = provider;
      throw new Error(`Unknown sandbox provider: ${_exhaustiveCheck}`);
  }
}
