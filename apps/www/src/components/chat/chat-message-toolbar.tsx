import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Link, RefreshCw, Split } from "lucide-react";
import { UIMessage } from "@terragon/shared";
import { cn } from "@/lib/utils";
import { useParams } from "next/navigation";
import { getModelDisplayName } from "@terragon/agent/utils";
import { RedoTaskDialog } from "./redo-task-dialog";
import { ForkTaskDialog } from "./fork-task-dialog";
import { useThread } from "./thread-context";
import { useFeatureFlag } from "@/hooks/use-feature-flag";

function getTextContent(message: UIMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      if (part.type === "rich-text") {
        return part.nodes.map((node) => node.text).join("");
      }
      if (part.type === "image") {
        return `![](${part.image_url})`;
      }
      return "";
    })
    .join("\n");
}

function getModelNameFromMessage(message: UIMessage): string | null {
  if (message.role === "user" && message.model) {
    return getModelDisplayName(message.model).fullName;
  }
  return null;
}

export function MessageToolbar({
  message,
  messageIndex,
  className,
  isFirstUserMessage,
  isLatestAgentMessage,
  isAgentWorking,
}: {
  message: UIMessage;
  messageIndex: number;
  className?: string;
  isFirstUserMessage: boolean;
  isLatestAgentMessage: boolean;
  isAgentWorking: boolean;
}) {
  const { thread, threadChat } = useThread();
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showRedoDialog, setShowRedoDialog] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const params = useParams();
  const isForkTaskEnabled = useFeatureFlag("forkTask");

  const handleCopy = async () => {
    if (copied) {
      return;
    }
    try {
      await navigator.clipboard.writeText(getTextContent(message));
      toast.success("Copied");
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      toast.error("Failed to copy message");
    }
  };

  const handleCopyLink = async () => {
    if (linkCopied || messageIndex === undefined) {
      return;
    }
    try {
      const threadId = params.id as string;
      const url = `${window.location.origin}/task/${threadId}#message-${messageIndex}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
      setLinkCopied(true);
      setTimeout(() => {
        setLinkCopied(false);
      }, 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  // Get model display name for user messages
  const modelDisplay = getModelNameFromMessage(message);
  const hasTextContent = message.parts.some(
    (part) => part.type === "text" || part.type === "rich-text",
  );
  // Only show the toolbar if there is text content in the message or if it's a user message with model info
  if (
    !hasTextContent &&
    !modelDisplay &&
    !isFirstUserMessage &&
    !isLatestAgentMessage
  ) {
    return null;
  }
  return (
    <>
      <div
        className={cn(
          "flex gap-1 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity",
          {
            "justify-start": message.role === "agent",
            "justify-end": message.role === "user",
          },
          className,
        )}
      >
        {modelDisplay && (
          <span
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground rounded-md select-none"
            title={`Model: ${modelDisplay}`}
          >
            <span>{modelDisplay}</span>
          </span>
        )}
        {isFirstUserMessage && threadChat && (
          <button
            onClick={() => setShowRedoDialog(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
            title="Retry task"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
        {hasTextContent && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
            title="Copy message"
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        )}
        {messageIndex !== undefined && hasTextContent && (
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
            title="Copy link to message"
          >
            {linkCopied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Link className="h-3 w-3" />
            )}
          </button>
        )}
        {isForkTaskEnabled && isLatestAgentMessage && !isAgentWorking && (
          <button
            onClick={() => setShowForkDialog(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
            title="Fork task"
          >
            <Split className="h-3 w-3" />
          </button>
        )}
      </div>
      {showRedoDialog && thread && threadChat && (
        <RedoTaskDialog
          open={showRedoDialog}
          thread={thread}
          threadChat={threadChat}
          onOpenChange={setShowRedoDialog}
        />
      )}
      {showForkDialog && thread && threadChat && (
        <ForkTaskDialog
          open={showForkDialog}
          thread={thread}
          threadChat={threadChat}
          onOpenChange={setShowForkDialog}
        />
      )}
    </>
  );
}
