import type { Story, StoryDefault } from "@ladle/react";
import {
  GenericToolPart,
  GenericToolPartContent,
  GenericToolPartContentOneLine,
  GenericToolPartContentResultWithLines,
  GenericToolPartContentResultWithPreview,
  GenericToolPartContentRow,
} from "./generic-ui";

const longLine = Array(10)
  .fill(
    "This is a very long line that goes on and on and on and might cause display issues when it's only one line but extremely long. ",
  )
  .join("");

export const PendingOneLine: Story = () => {
  return (
    <GenericToolPart toolName="ToolName" toolArg="toolArg" toolStatus="pending">
      <GenericToolPartContentOneLine toolStatus="pending">
        Working...
      </GenericToolPartContentOneLine>
    </GenericToolPart>
  );
};

export const PendingWithChildren: Story = () => {
  return (
    <GenericToolPart toolName="ToolName" toolArg="toolArg" toolStatus="pending">
      <GenericToolPartContent toolStatus="pending">
        <GenericToolPartContentRow index={0}>
          <GenericToolPart
            toolName="NestedToolName"
            toolArg="toolArg"
            toolStatus="completed"
          >
            <GenericToolPartContentOneLine toolStatus="completed">
              Done
            </GenericToolPartContentOneLine>
          </GenericToolPart>
        </GenericToolPartContentRow>
        <GenericToolPartContentRow index={1}>
          <GenericToolPart
            toolName="NestedToolName"
            toolArg="toolArg"
            toolStatus="pending"
          >
            <GenericToolPartContentOneLine toolStatus="pending">
              Working...
            </GenericToolPartContentOneLine>
          </GenericToolPart>
        </GenericToolPartContentRow>
      </GenericToolPartContent>
    </GenericToolPart>
  );
};

export const CompletedResultWithLines: Story = () => {
  return (
    <GenericToolPart
      toolName="ToolName"
      toolArg="toolArg"
      toolStatus="completed"
    >
      <GenericToolPartContentResultWithLines
        lines={["line1", "line2", "line3"]}
        toolStatus="completed"
      />
    </GenericToolPart>
  );
};

export const CompletedResultWithEmptyLines: Story = () => {
  return (
    <GenericToolPart
      toolName="ToolName"
      toolArg="toolArg"
      toolStatus="completed"
    >
      <GenericToolPartContentResultWithLines
        lines={[]}
        toolStatus="completed"
      />
    </GenericToolPart>
  );
};

export const CompletedResultWithFewLongLines: Story = () => {
  return (
    <GenericToolPart
      toolName="ToolName"
      toolArg="toolArg"
      toolStatus="completed"
    >
      <GenericToolPartContentResultWithLines
        lines={[longLine, longLine, longLine, longLine]}
        toolStatus="completed"
      />
    </GenericToolPart>
  );
};

export const CompletedResultWithManyLines: Story = () => {
  return (
    <GenericToolPart
      toolName="ToolName"
      toolArg="toolArg"
      toolStatus="completed"
    >
      <GenericToolPartContentResultWithLines
        lines={[
          "line1",
          "line2",
          "line3",
          "line4",
          "line5",
          "line6",
          "line7",
          "line8",
          "line9",
          "line10",
        ]}
        toolStatus="completed"
      />
    </GenericToolPart>
  );
};

export const CompletedResultWithPreview: Story = () => {
  return (
    <GenericToolPart
      toolName="ToolName"
      toolArg="toolArg"
      toolStatus="completed"
    >
      <GenericToolPartContentResultWithPreview
        preview="Preview"
        content={[
          "line1",
          "line2",
          "line3",
          "line4",
          "line5",
          "line6",
          "line7",
          "line8",
          "line9",
          "line10",
        ].join("\n")}
        toolStatus="completed"
      />
    </GenericToolPart>
  );
};

export const ErrorOneLine: Story = () => {
  return (
    <GenericToolPart toolName="ToolName" toolArg="toolArg" toolStatus="error">
      <GenericToolPartContentOneLine toolStatus="error">
        Tool failed
      </GenericToolPartContentOneLine>
    </GenericToolPart>
  );
};

export const LongOneLine: Story = () => {
  return (
    <GenericToolPart
      toolName="ToolName"
      toolArg="toolArg"
      toolStatus="completed"
    >
      <GenericToolPartContentOneLine toolStatus="completed">
        {longLine}
      </GenericToolPartContentOneLine>
    </GenericToolPart>
  );
};

export const ShortOneLine: Story = () => {
  return (
    <GenericToolPart
      toolName="ToolName"
      toolArg="toolArg"
      toolStatus="completed"
    >
      <GenericToolPartContentOneLine toolStatus="completed">
        This is a short line that doesn't need clamping
      </GenericToolPartContentOneLine>
    </GenericToolPart>
  );
};

export default {
  title: "Chat/Generic UI",
} satisfies StoryDefault;
