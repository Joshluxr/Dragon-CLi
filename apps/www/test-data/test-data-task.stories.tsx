import type { Story, StoryDefault } from "@ladle/react";
import { ChatMessage } from "@/components/chat/chat-message";
import { toUIMessages } from "@/components/chat/toUIMessages";
import claudeJson from "./claude-json-task-test.json";
import { toDBMessage } from "@/agent/msg/toDBMessage";

export const Task: Story = () => {
  const dbMessages = claudeJson
    .map((x: any) => {
      return toDBMessage(x);
    })
    .flat();
  const messages = toUIMessages({ dbMessages, agent: "claudeCode" });
  return (
    <div>
      {messages.map((message, idx) => {
        return <ChatMessage key={idx} message={message} />;
      })}
    </div>
  );
};

export default {
  title: "Test Data",
} satisfies StoryDefault;
