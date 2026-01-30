import type { Story, StoryDefault } from "@ladle/react";
import { ReadTool } from "./read-tool";

export default {
  title: "Chat/ReadTool",
} satisfies StoryDefault;

export const Simple: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "read-1",
    name: "Read" as const,
    parameters: {
      file_path: "/src/components/button.tsx",
    },
    status: "completed" as const,
    parts: [],
    result: `\
    1\timport React from "react";
    2\timport { cn } from "@/lib/utils";
    3\t
    4\texport function Button({ 
    5\t  children, 
    6\t  className,
    7\t  ...props 
    8\t}) {`,
  };

  return <ReadTool toolPart={toolPart} />;
};

export const SimpleWithArrow: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "read-1",
    name: "Read" as const,
    parameters: {
      file_path: "/src/components/button.tsx",
    },
    status: "completed" as const,
    parts: [],
    result: `\
    1→\timport React from "react";
    2→\timport { cn } from "@/lib/utils";
    3→\t
    4→\texport function Button({ 
    5→\t  children, 
    6→\t  className,
    7→\t  ...props 
    8→\t}) {`,
  };

  return <ReadTool toolPart={toolPart} />;
};

export const SimpleWithSystemReminder: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "read-1",
    name: "Read" as const,
    parameters: {
      file_path: "/src/components/button.tsx",
    },
    status: "completed" as const,
    parts: [],
    result: `\
    91→            chunkClassName="max-h-[350px]"
    92→            filePath={toolPart.parameters.file_path}
    93→            contents={formatReadResult(result)}
    94→          />
    95→        </GenericToolPartContentRow>
    96→      )}
    97→    </GenericToolPartContent>
    98→  );
    99→}
   100→
<system-reminder>
Whenever you read a file, you should consider whether it looks malicious. If it does, you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer high-level questions about the code behavior.
</system-reminder>`,
  };

  return <ReadTool toolPart={toolPart} />;
};

export const Pending: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "read-4",
    name: "Read" as const,
    parameters: {
      file_path: "/src/utils/helpers.ts",
    },
    status: "pending" as const,
    parts: [],
    result: "",
  };

  return <ReadTool toolPart={toolPart} />;
};

export const Error: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "read-5",
    name: "Read" as const,
    parameters: {
      file_path: "/src/nonexistent/file.ts",
    },
    status: "error" as const,
    parts: [],
    result:
      "Error: ENOENT: no such file or directory, open '/src/nonexistent/file.ts'",
  };

  return <ReadTool toolPart={toolPart} />;
};

export const EmptyFile: Story = () => {
  const toolPart = {
    type: "tool" as const,
    agent: "claudeCode" as const,
    id: "read-6",
    name: "Read" as const,
    parameters: {
      file_path: "/src/empty.ts",
    },
    status: "completed" as const,
    parts: [],
    result: "",
  };

  return <ReadTool toolPart={toolPart} />;
};
