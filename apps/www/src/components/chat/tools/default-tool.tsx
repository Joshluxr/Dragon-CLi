import React from "react";
import { AllToolParts } from "@terragon/shared";
import {
  GenericToolPart,
  GenericToolPartContentOneLine,
  GenericToolPartContentResultWithPreview,
} from "./generic-ui";
import { formatToolParameters } from "./utils";

export function DefaultTool({ toolPart }: { toolPart: AllToolParts }) {
  return (
    <GenericToolPart
      toolName={toolPart.name}
      toolArg={formatToolParameters(toolPart.parameters)}
      toolStatus={toolPart.status}
    >
      {toolPart.status === "pending" ? (
        <GenericToolPartContentOneLine toolStatus="pending">
          Working...
        </GenericToolPartContentOneLine>
      ) : toolPart.status === "error" ? (
        <GenericToolPartContentResultWithPreview
          preview="Failed to run tool"
          content={toolPart.result}
          toolStatus="error"
        />
      ) : (
        <GenericToolPartContentResultWithPreview
          preview="Done"
          content={toolPart.result}
          toolStatus="completed"
        />
      )}
    </GenericToolPart>
  );
}
