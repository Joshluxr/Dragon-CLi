import { ThreadInfo } from "@terragon/shared";
import {
  archiveThread,
  unarchiveThread,
} from "@/server-actions/archive-thread";
import { deleteThread } from "@/server-actions/delete-thread";
import { readThread } from "@/server-actions/read-thread";
import { unreadThread } from "@/server-actions/unread-thread";
import {
  threadQueryKeys,
  isValidThreadListFilter,
  isMatchingThreadForFilter,
} from "./thread-queries";
import { updateThreadVisibilityAction } from "@/server-actions/thread-visibility";
import { updateThreadName } from "@/server-actions/update-thread-name";
import {
  submitDraftThread,
  updateDraftThread,
} from "@/server-actions/draft-thread";
import { ServerActionResult } from "@/lib/server-actions";
import { useServerActionMutation } from "./server-action-helpers";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";

// Generic hook for thread mutations with optimistic updates
function useThreadMutation<TVariables extends { threadId: string }>({
  mutationFn,
  updateThread,
}: {
  mutationFn: (variables: TVariables) => Promise<ServerActionResult>;
  updateThread: (thread: ThreadInfo, variables: TVariables) => ThreadInfo;
}) {
  const queryClient = useQueryClient();
  return useServerActionMutation({
    mutationFn,
    onMutate: async (variables) => {
      const { threadId } = variables;

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["threads"] });

      // Helper to update a thread
      const updateThreadWrapper = (thread: ThreadInfo) => {
        if (thread.id !== threadId) return thread;
        return updateThread(thread, variables);
      };

      // Update thread detail query
      queryClient.setQueryData<ThreadInfo>(
        threadQueryKeys.detail(threadId),
        (old) => (old ? updateThreadWrapper(old) : old),
      );

      // Update all thread list queries (both filtered and unfiltered)
      const cache = queryClient.getQueryCache();
      const queries = cache.findAll({ queryKey: threadQueryKeys.list(null) });

      queries.forEach((query) => {
        const queryKey = query.queryKey as any[];
        const filters = queryKey[2];
        queryClient.setQueryData<InfiniteData<ThreadInfo[]>>(
          queryKey,
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page, idx) => {
                const thread = page.find((t) => t.id === threadId);
                if (!thread) {
                  return page;
                }
                const updatedThread = updateThread(thread, variables);
                if (isValidThreadListFilter(filters)) {
                  if (!isMatchingThreadForFilter(updatedThread, filters)) {
                    return page.filter((t) => t.id !== threadId);
                  }
                }
                return page.map((t) => (t.id === threadId ? updatedThread : t));
              }),
            };
          },
        );
      });
    },
    onError: (error) => {
      console.error(error);
      // On error, invalidate all thread queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
    onSettled: () => {
      // Always invalidate to ensure consistency with server
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });
}

// Archive/Unarchive mutation
export function useArchiveMutation() {
  return useThreadMutation({
    mutationFn: async ({
      threadId,
      archive,
    }: {
      threadId: string;
      archive: boolean;
    }) => {
      if (archive) {
        return archiveThread(threadId);
      } else {
        return unarchiveThread(threadId);
      }
    },
    updateThread: (thread, { archive }) => ({
      ...thread,
      archived: archive,
      // When archiving, mark as read (server does this too)
      isUnread: archive ? false : thread.isUnread,
    }),
  });
}

// Read thread mutation
export function useReadThreadMutation() {
  return useThreadMutation({
    mutationFn: readThread,
    updateThread: (thread) => ({ ...thread, isUnread: false }),
  });
}

// Unread thread mutation
export function useUnreadThreadMutation() {
  return useThreadMutation({
    mutationFn: unreadThread,
    updateThread: (thread) => ({ ...thread, isUnread: true }),
  });
}

// Delete mutation with optimistic removal
export function useDeleteThreadMutation() {
  const queryClient = useQueryClient();
  return useServerActionMutation({
    mutationFn: deleteThread,
    onMutate: async (threadId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["threads"] });
      // Remove thread from detail query
      queryClient.removeQueries({ queryKey: threadQueryKeys.detail(threadId) });
      // Update thread lists
      queryClient.setQueriesData<InfiniteData<ThreadInfo[]>>(
        { queryKey: threadQueryKeys.list(null) },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.filter((thread) => thread.id !== threadId),
            ),
          };
        },
      );
    },
    onError: () => {
      // On error, invalidate all thread queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
    onSettled: () => {
      // Always invalidate to ensure consistency with server
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });
}

export function useUpdateThreadVisibilityMutation() {
  return useThreadMutation({
    mutationFn: updateThreadVisibilityAction,
    updateThread: (thread, { visibility }) => ({ ...thread, visibility }),
  });
}

export function useUpdateThreadNameMutation() {
  return useThreadMutation({
    mutationFn: updateThreadName,
    updateThread: (thread, { name }) => ({ ...thread, name }),
  });
}

export function useUpdateDraftThreadMutation() {
  return useThreadMutation({
    mutationFn: updateDraftThread,
    updateThread: (thread, { updates }) => ({ ...thread, ...updates }),
  });
}

export function useSubmitDraftThreadMutation() {
  return useThreadMutation({
    mutationFn: submitDraftThread,
    updateThread: (thread, args) => ({
      ...thread,
      status: args.scheduleAt ? ("scheduled" as const) : ("queued" as const),
      scheduleAt: args.scheduleAt ? new Date(args.scheduleAt) : null,
      draftMessage: null,
    }),
  });
}
