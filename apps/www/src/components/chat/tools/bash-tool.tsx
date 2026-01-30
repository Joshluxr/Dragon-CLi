import React from "react";
import { AllToolParts } from "@terragon/shared";
import {
  GenericToolPart,
  GenericToolPartContentResultWithLines,
  GenericToolPartContentOneLine,
} from "./generic-ui";

export function BashTool({
  toolPart,
}: {
  toolPart: Extract<AllToolParts, { name: "Bash" }>;
}) {
  return (
    <GenericToolPart
      toolName="Bash"
      toolArg={toolPart.parameters.command}
      toolStatus={toolPart.status}
    >
      {toolPart.status === "pending" ? (
        <GenericToolPartContentOneLine toolStatus={toolPart.status}>
          Running...
        </GenericToolPartContentOneLine>
      ) : (
        <GenericToolPartContentResultWithLines
          lines={
            toolPart.result.trim() === "" ? [] : toolPart.result.split("\n")
          }
          toolStatus={toolPart.status}
          renderAnsi
        />
      )}
    </GenericToolPart>
  );
}
