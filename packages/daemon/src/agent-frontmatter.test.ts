import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AgentFrontmatterReader } from "./agent-frontmatter";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock runtime for testing
const mockRuntime = {
  logger: {
    info: () => {},
    error: () => {},
  },
} as any;

describe("AgentFrontmatterReader", () => {
  let tempDir: string;
  let reader: AgentFrontmatterReader;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-test-"));
    process.chdir(tempDir);
    reader = new AgentFrontmatterReader(mockRuntime);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should load agents from .claude/agents directory", async () => {
    // Create test structure
    const agentsDir = path.join(tempDir, ".claude", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });

    // Create test agent file
    const agentContent = `---
name: test-agent
description: A test agent
color: blue
---

Agent content`;

    fs.writeFileSync(path.join(agentsDir, "test-agent.md"), agentContent);

    await reader.loadAgents();

    const agentProps = reader.getAgentProperties("test-agent");
    expect(agentProps).toBeDefined();
    expect(agentProps?.name).toBe("test-agent");
    expect(agentProps?.description).toBe("A test agent");
    expect(agentProps?.color).toBe("blue");
  });

  it("should handle missing .claude/agents directory gracefully", async () => {
    await reader.loadAgents();
    const allAgents = reader.getAllAgents();
    expect(allAgents.size).toBe(0);
  });

  it("should handle invalid frontmatter gracefully", async () => {
    const agentsDir = path.join(tempDir, ".claude", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });

    // Create invalid agent file
    const invalidContent = `This is not valid frontmatter`;
    fs.writeFileSync(path.join(agentsDir, "invalid.md"), invalidContent);

    await reader.loadAgents();
    const allAgents = reader.getAllAgents();
    expect(allAgents.size).toBe(0);
  });
});
