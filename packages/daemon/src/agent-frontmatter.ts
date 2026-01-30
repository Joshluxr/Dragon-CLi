import fs from "node:fs";
import path from "node:path";
import type { IDaemonRuntime } from "./runtime";

export interface AgentProperties {
  name: string;
  description: string;
  color?: string;
}

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  color?: string;
}

export class AgentFrontmatterReader {
  private agentProperties: Map<string, AgentProperties> = new Map();

  constructor(private runtime: IDaemonRuntime) {}

  async loadAgents(): Promise<void> {
    const agentsDir = path.join(process.cwd(), ".claude", "agents");
    this.runtime.logger.info("Starting agent frontmatter loading", {
      directory: agentsDir,
      cwd: process.cwd(),
    });

    try {
      if (!fs.existsSync(agentsDir)) {
        this.runtime.logger.info(
          "No .claude/agents directory found, skipping agent loading",
          {
            checkedPath: agentsDir,
          },
        );
        return;
      }

      const files = fs.readdirSync(agentsDir);
      const markdownFiles = files.filter((file) => file.endsWith(".md"));

      this.runtime.logger.info("Found agent files", {
        totalFiles: files.length,
        markdownFiles: markdownFiles.length,
        files: markdownFiles,
      });

      for (const file of markdownFiles) {
        const filePath = path.join(agentsDir, file);
        this.runtime.logger.info("Processing agent file", {
          file,
          filePath,
        });

        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const data = this.parseFrontmatter(content);

          this.runtime.logger.info("Parsed frontmatter", {
            file,
            hasName: !!data.name,
            hasDescription: !!data.description,
            hasColor: !!data.color,
          });

          if (data.name && data.description) {
            const agentProps: AgentProperties = {
              name: data.name,
              description: data.description,
              color: data.color,
            };
            this.agentProperties.set(data.name, agentProps);
            this.runtime.logger.info(
              "Successfully loaded agent from frontmatter",
              {
                name: data.name,
                color: data.color || "(no color)",
                descriptionLength: data.description.length,
                file,
              },
            );
          } else {
            this.runtime.logger.warn("Agent file missing required fields", {
              file,
              hasName: !!data.name,
              hasDescription: !!data.description,
            });
          }
        } catch (error) {
          this.runtime.logger.error("Failed to read or parse agent file", {
            file,
            error: error instanceof Error ? error.message : String(error),
            errorType:
              error instanceof Error ? error.constructor.name : typeof error,
          });
        }
      }

      this.runtime.logger.info("Agent loading complete", {
        agentCount: this.agentProperties.size,
        agents: Array.from(this.agentProperties.keys()),
      });
    } catch (error) {
      this.runtime.logger.error("Failed to load agents", { error });
    }
  }

  getAgentProperties(agentName: string): AgentProperties | undefined {
    return this.agentProperties.get(agentName);
  }

  getAllAgents(): Map<string, AgentProperties> {
    return this.agentProperties;
  }

  private parseFrontmatter(content: string): ParsedFrontmatter {
    const result: ParsedFrontmatter = {};

    // Check if content starts with frontmatter delimiter
    if (!content.startsWith("---")) {
      return result;
    }

    // Find the end of frontmatter - look for either '\n---\n' or '\n---' at end of string
    let endIndex = content.indexOf("\n---\n", 4);
    if (endIndex === -1) {
      // Check if file ends with '\n---'
      const endPattern = "\n---";
      if (content.endsWith(endPattern)) {
        endIndex = content.length - endPattern.length;
      } else {
        return result;
      }
    }

    // Extract frontmatter content
    const frontmatterContent = content.substring(4, endIndex);

    // Extract name using regex
    const nameMatch = frontmatterContent.match(/^name:\s*(.+)$/m);
    if (nameMatch && nameMatch[1]) {
      result.name = nameMatch[1].trim();
    }

    // Extract description using regex - simplified to just get the first line for now
    const descriptionMatch = frontmatterContent.match(/^description:\s*(.+)$/m);
    if (descriptionMatch && descriptionMatch[1]) {
      result.description = descriptionMatch[1].trim();
    }

    // Extract color using regex
    const colorMatch = frontmatterContent.match(/^color:\s*(.+)$/m);
    if (colorMatch && colorMatch[1]) {
      // Remove quotes if present and normalize to lowercase
      result.color = colorMatch[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .toLowerCase();
    }

    return result;
  }
}
