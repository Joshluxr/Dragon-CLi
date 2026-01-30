"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  DBUserMessage,
  ThreadChatInfoFull,
  ThreadInfo,
} from "@terragon/shared";
import { GenericPromptBox } from "../promptbox/generic-promptbox";
import { forkThread } from "@/server-actions/fork-thread";
import { RepoBranchSelector } from "../repo-branch-selector";
import { PromptBoxToolBelt } from "../promptbox/prompt-box-tool-belt";
import { useServerActionMutation } from "@/queries/server-action-helpers";
import { toast } from "sonner";
import { getLastUserMessageModel } from "@/lib/db-message-helpers";
import { getDefaultModelForAgent } from "@terragon/agent/utils";
import { usePromptBoxToolBeltOptions } from "../promptbox/prompt-box-tool-belt";

export function ForkTaskDialog({
  thread,
  threadChat,
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: ThreadInfo;
  threadChat: ThreadChatInfoFull;
}) {
  const [branchName, setBranchName] = useState<string>(
    // Only use the thread branch name if it exists and has git diff stats, which
    // means the branch has changes and we've pushed it to GitHub.
    thread.gitDiffStats && thread.branchName
      ? thread.branchName
      : thread.repoBaseBranchName,
  );
  const {
    skipSetup,
    disableGitCheckpointing,
    createNewBranch,
    setSkipSetup,
    setDisableGitCheckpointing,
    setCreateNewBranch,
  } = usePromptBoxToolBeltOptions({
    branchName,
    shouldUseCookieValues: false,
    initialSkipSetup: !!thread.skipSetup,
    initialDisableGitCheckpointing: !!thread.disableGitCheckpointing,
    initialCreateNewBranch: true,
  });

  const lastSelectedModel = useMemo(() => {
    return (
      getLastUserMessageModel(threadChat.messages ?? []) ??
      getDefaultModelForAgent({
        agent: threadChat.agent,
        agentVersion: "latest",
      })
    );
  }, [threadChat.messages, threadChat.agent]);

  const forkThreadMutation = useServerActionMutation({
    mutationFn: async ({ userMessage }: { userMessage: DBUserMessage }) => {
      return await forkThread({
        threadId: thread.id,
        threadChatId: threadChat.id,
        userMessage,
        repoFullName: thread.githubRepoFullName,
        branchName,
        disableGitCheckpointing,
        skipSetup,
        createNewBranch,
      });
    },
    onSuccess: () => {
      onOpenChange(false);
      toast.success("Task created");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Fork this task</DialogTitle>
          <DialogDescription>
            Create a new task based on this one. The task context will be
            compacted and included with your new message.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
          <GenericPromptBox
            className="min-h-[200px] max-h-[80dvh]"
            placeholder="Describe what you want to do with this task..."
            message={{
              type: "user",
              model: lastSelectedModel,
              parts: [],
            }}
            repoFullName={thread.githubRepoFullName}
            branchName={branchName}
            onSubmit={forkThreadMutation.mutateAsync}
            hideSubmitButton={false}
            autoFocus={true}
            forcedAgent={null}
            forcedAgentVersion={null}
          />
          <div className="flex items-center justify-between">
            <RepoBranchSelector
              hideRepoSelector
              selectedRepoFullName={thread.githubRepoFullName}
              selectedBranch={branchName}
              onChange={(_, branchName) => {
                if (branchName) {
                  setBranchName(branchName);
                }
              }}
            />
            <PromptBoxToolBelt
              showSkipArchive={false}
              skipArchiveValue={false}
              onSkipArchiveChange={() => {}}
              showSkipSetup={true}
              skipSetupValue={skipSetup}
              onSkipSetupChange={setSkipSetup}
              skipSetupDisabled={!thread.githubRepoFullName}
              showCreateNewBranchOption={true}
              createNewBranchValue={createNewBranch}
              onCreateNewBranchChange={setCreateNewBranch}
              createNewBranchDisabled={!thread.githubRepoFullName}
              showCheckpoint={true}
              checkpointValue={disableGitCheckpointing}
              onCheckpointChange={setDisableGitCheckpointing}
              checkpointDisabled={!thread.githubRepoFullName}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
