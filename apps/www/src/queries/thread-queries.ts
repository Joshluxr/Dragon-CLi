import { getThreadAction } from "@/server-actions/get-thread";
import { getThreadsAction } from "@/server-actions/get-threads";
import { getServerActionQueryOptions } from "./server-action-helpers";
import { ThreadInfo } from "@terragon/shared/db/types";
import {
  QueryKey,
  UseInfiniteQueryOptions,
  InfiniteData,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { unwrapResult } from "@/lib/server-actions";

export type ThreadListFilters = {
  archived?: boolean;
  automationId?: string;
  limit?: number;
};

// Type guard to ensure filters has the expected properties
export function isValidThreadListFilter(
  filter: any,
): filter is ThreadListFilters {
  return (
    filter !== null &&
    typeof filter === "object" &&
    (filter.archived === undefined || typeof filter.archived === "boolean") &&
    (filter.automationId === undefined ||
      typeof filter.automationId === "string")
  );
}

export function isMatchingThreadForFilter(
  thread: ThreadInfo,
  filters: ThreadListFilters,
): boolean {
  if (filters.archived !== undefined && filters.archived !== thread.archived) {
    return false;
  }
  if (
    filters.automationId !== undefined &&
    filters.automationId !== thread.automationId
  ) {
    return false;
  }
  return true;
}

export const threadQueryKeys = {
  list: (filters: ThreadListFilters | null) => {
    const key = ["threads", "list"] as any;
    if (filters) {
      key.push(filters);
    }
    return key;
  },
  detail: (id: string) => ["threads", "detail", id] as const,
};

export function threadQueryOptions(threadId: string) {
  return getServerActionQueryOptions({
    queryKey: threadQueryKeys.detail(threadId),
    queryFn: async () => {
      return getThreadAction(threadId);
    },
  });
}

const THREADS_PER_PAGE = 100;

export function threadListQueryOptions(filters: ThreadListFilters = {}) {
  const { archived, automationId, limit = THREADS_PER_PAGE } = filters;
  const options: UseInfiniteQueryOptions<
    ThreadInfo[],
    unknown,
    InfiniteData<ThreadInfo[]>,
    ThreadInfo[],
    QueryKey,
    number
  > = {
    queryKey: threadQueryKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      const offset = pageParam * limit;
      return unwrapResult(
        await getThreadsAction({ archived, automationId, limit, offset }),
      );
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      return lastPage.length === limit ? pages.length : undefined;
    },
  };
  return options;
}

export function useInfiniteThreadList(filters: ThreadListFilters = {}) {
  return useInfiniteQuery(threadListQueryOptions(filters));
}
