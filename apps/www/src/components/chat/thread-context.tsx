import { ThreadInfoFull, ThreadChatInfoFull } from "@terragon/shared";
import React from "react";

type PromptBoxRef = {
  focus: () => void;
  setPermissionMode: (mode: "allowAll" | "plan") => void;
};

type ThreadContextType = {
  thread: ThreadInfoFull | null;
  threadChat: ThreadChatInfoFull | null;
  isReadOnly: boolean;
  promptBoxRef?: React.RefObject<PromptBoxRef | null>;
};

export const ThreadContext = React.createContext<ThreadContextType>({
  thread: null,
  threadChat: null,
  isReadOnly: false,
});

export const useThread = () => {
  return React.use(ThreadContext);
};

export function ThreadProvider({
  children,
  thread,
  threadChat,
  promptBoxRef,
  isReadOnly,
}: {
  children: React.ReactNode;
} & ThreadContextType) {
  const value = React.useMemo(
    () => ({
      thread,
      threadChat,
      isReadOnly,
      promptBoxRef,
    }),
    [thread, threadChat, isReadOnly, promptBoxRef],
  );
  return (
    <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>
  );
}
