import type { Story, StoryDefault } from "@ladle/react";
import { BashTool } from "./bash-tool";

export const CompletedWithPlainText: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "bash-1",
    name: "Bash" as const,
    parameters: {
      command: "echo 'Hello, world!'",
    },
    status: "completed" as const,
    parts: [],
    result: "Hello, world!",
  };

  return <BashTool toolPart={toolPart} />;
};

export const CompletedWithAnsiColors: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "bash-2",
    name: "Bash" as const,
    parameters: {
      command: "echo with colors",
    },
    status: "completed" as const,
    parts: [],
    // ANSI escape codes for red, green, blue, and yellow
    result: [
      "\x1b[31mRed text\x1b[0m",
      "\x1b[32mGreen text\x1b[0m",
      "\x1b[34mBlue text\x1b[0m",
      "\x1b[33mYellow text\x1b[0m",
    ].join("\n"),
  };

  return <BashTool toolPart={toolPart} />;
};

export const CompletedWithBoldAndColors: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "bash-3",
    name: "Bash" as const,
    parameters: {
      command: "npm test",
    },
    status: "completed" as const,
    parts: [],
    // ANSI codes for bold and colors
    result: [
      "\x1b[1m\x1b[32m✓\x1b[0m Test suite passed",
      "\x1b[1m\x1b[31m✗\x1b[0m Some test failed",
      "\x1b[1mBold text\x1b[0m",
      "\x1b[4mUnderlined text\x1b[0m",
    ].join("\n"),
  };

  return <BashTool toolPart={toolPart} />;
};

export const CompletedWithGitStatus: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "bash-4",
    name: "Bash" as const,
    parameters: {
      command: "git status",
    },
    status: "completed" as const,
    parts: [],
    // Simulating typical git status output with colors
    result: [
      "On branch main",
      "Your branch is up to date with 'origin/main'.",
      "",
      "Changes not staged for commit:",
      '  (use "git add <file>..." to update what will be committed)',
      '  (use "git restore <file>..." to discard changes in working directory)',
      "\x1b[31m\tmodified:   src/file1.ts\x1b[0m",
      "\x1b[31m\tmodified:   src/file2.ts\x1b[0m",
      "",
      "Untracked files:",
      '  (use "git add <file>..." to include in what will be committed)',
      "\x1b[31m\tsrc/newfile.ts\x1b[0m",
      "",
      'no changes added to commit (use "git add" and/or "git commit -a")',
    ].join("\n"),
  };

  return <BashTool toolPart={toolPart} />;
};

export const CompletedWithManyLines: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "bash-5",
    name: "Bash" as const,
    parameters: {
      command: "npm install",
    },
    status: "completed" as const,
    parts: [],
    result: Array(20)
      .fill(0)
      .map(
        (_, i) =>
          `\x1b[${31 + (i % 6)}m${i % 2 === 0 ? "✓" : "→"} Installing package ${i + 1}\x1b[0m`,
      )
      .join("\n"),
  };

  return <BashTool toolPart={toolPart} />;
};

export const Pending: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "bash-6",
    name: "Bash" as const,
    parameters: {
      command: "npm test",
    },
    status: "pending" as const,
    parts: [],
    result: "",
  };

  return <BashTool toolPart={toolPart} />;
};

export const Error: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "bash-7",
    name: "Bash" as const,
    parameters: {
      command: "npm test",
    },
    status: "error" as const,
    parts: [],
    result: "\x1b[31mError: Command failed with exit code 1\x1b[0m",
  };

  return <BashTool toolPart={toolPart} />;
};

export default {
  title: "Chat/Bash Tool",
} satisfies StoryDefault;
