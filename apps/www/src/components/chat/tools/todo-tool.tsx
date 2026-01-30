import React from "react";
import { AllToolParts } from "@terragon/shared";
import { cn } from "@/lib/utils";
import {
  GenericToolPartContent,
  GenericToolPartContentOneLine,
  GenericToolPart,
} from "./generic-ui";

export function TodoReadTool({
  toolPart,
}: {
  toolPart: Extract<AllToolParts, { name: "TodoRead" }>;
}) {
  if (toolPart.status === "error") {
    return (
      <GenericToolPart
        toolName="Read Todos"
        toolArg={null}
        toolStatus={toolPart.status}
      >
        <GenericToolPartContentOneLine toolStatus="error">
          □ Failed to read todo list
        </GenericToolPartContentOneLine>
      </GenericToolPart>
    );
  }

  return null;
}

export function TodoWriteTool({
  toolPart,
}: {
  toolPart: Extract<AllToolParts, { name: "TodoWrite" }>;
}) {
  if (toolPart.status === "pending") {
    return (
      <GenericToolPart
        toolName="Update Todos"
        toolArg={null}
        toolStatus={toolPart.status}
      >
        <GenericToolPartContentOneLine toolStatus="pending">
          Updating todo list...
        </GenericToolPartContentOneLine>
      </GenericToolPart>
    );
  }
  if (toolPart.status === "error") {
    return (
      <GenericToolPart
        toolName="Update Todos"
        toolArg={null}
        toolStatus={toolPart.status}
      >
        <GenericToolPartContentOneLine toolStatus="error">
          □ Failed to update todo list
        </GenericToolPartContentOneLine>
      </GenericToolPart>
    );
  }
  return (
    <GenericToolPart
      toolName="Update Todos"
      toolArg={null}
      toolStatus={toolPart.status}
    >
      <GenericToolPartContent
        toolStatus={toolPart.status}
        className="grid-cols-[auto_auto_1fr]"
      >
        {toolPart.parameters.todos.map((todo, index) => (
          <React.Fragment key={index}>
            <span>{index === 0 ? "└" : " "}</span>
            <span
              className={cn({
                "text-muted-foreground": todo.status === "pending",
              })}
            >
              {todo.status === "completed"
                ? "☒"
                : todo.status === "in_progress"
                  ? "◼"
                  : "□"}
            </span>
            <span
              className={cn({
                "line-through text-muted-foreground":
                  todo.status === "completed",
                "font-semibold": todo.status === "in_progress",
              })}
            >
              {todo.content}
            </span>
          </React.Fragment>
        ))}
      </GenericToolPartContent>
    </GenericToolPart>
  );
}
