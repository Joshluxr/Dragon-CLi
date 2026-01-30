import React from "react";
import { AllToolParts } from "@terragon/shared";
import {
  GenericToolPart,
  GenericToolPartContentOneLine,
  GenericToolPartContentResultWithLines,
} from "./generic-ui";

export function WebFetchTool({
  toolPart,
}: {
  toolPart: Extract<AllToolParts, { name: "WebFetch" }>;
}) {
  return (
    <GenericToolPart
      toolName="Fetch"
      toolArg={toolPart.parameters.url}
      toolStatus={toolPart.status}
    >
      <WebFetchToolContent toolPart={toolPart} />
    </GenericToolPart>
  );
}

function WebFetchToolContent({
  toolPart,
}: {
  toolPart: Extract<AllToolParts, { name: "WebFetch" }>;
}) {
  if (toolPart.status === "pending") {
    return (
      <GenericToolPartContentOneLine toolStatus="pending">
        Fetching...
      </GenericToolPartContentOneLine>
    );
  }
  if (toolPart.status === "error") {
    return (
      <GenericToolPartContentResultWithLines
        lines={toolPart.result.split("\n")}
        toolStatus="error"
      />
    );
  }
  return (
    <GenericToolPartContentOneLine toolStatus="completed">
      Done
    </GenericToolPartContentOneLine>
  );
}

export function WebSearchTool({
  toolPart,
}: {
  toolPart: Extract<AllToolParts, { name: "WebSearch" }>;
}) {
  return (
    <GenericToolPart
      toolName="WebSearch"
      toolArg={toolPart.parameters.query}
      toolStatus={toolPart.status}
    >
      <WebSearchToolContent toolPart={toolPart} />
    </GenericToolPart>
  );
}

function WebSearchToolContent({
  toolPart,
}: {
  toolPart: Extract<AllToolParts, { name: "WebSearch" }>;
}) {
  if (toolPart.status === "pending") {
    return (
      <GenericToolPartContentOneLine toolStatus="pending">
        Searching...
      </GenericToolPartContentOneLine>
    );
  }
  if (toolPart.status === "error") {
    return (
      <GenericToolPartContentResultWithLines
        lines={toolPart.result.split("\n")}
        toolStatus="error"
      />
    );
  }
  return (
    <GenericToolPartContentOneLine toolStatus="completed">
      Done
    </GenericToolPartContentOneLine>
  );
}
