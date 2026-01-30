import ChatUI from "@/components/chat/chat-ui";
import { getUserIdOrNull, getUserIdOrRedirect } from "@/lib/auth-server";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getThreadDocumentTitle } from "@/agent/thread-utils";
import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { threadQueryOptions } from "@/queries/thread-queries";
import { ThreadInfoFull } from "@terragon/shared";
import { getThreadAction } from "@/server-actions/get-thread";
import { unwrapResult } from "@/lib/server-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const userId = await getUserIdOrNull();
  if (!userId) {
    return { title: "Task | Terragon" };
  }
  const { id } = await params;
  const thread = unwrapResult(await getThreadAction(id));
  if (!thread) {
    return { title: "Task | Terragon" };
  }
  return {
    title: getThreadDocumentTitle(thread),
  };
}

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ readonly?: boolean }>;
}) {
  const userId = await getUserIdOrRedirect();
  const [{ id }, { readonly }] = await Promise.all([params, searchParams]);
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery(threadQueryOptions(id));
  const thread = queryClient.getQueryData<ThreadInfoFull>(
    threadQueryOptions(id).queryKey,
  );
  if (!thread) {
    return notFound();
  }
  if (thread.draftMessage) {
    return redirect(`/dashboard`);
  }
  const isReadOnly = thread.userId !== userId || !!readonly;
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatUI threadId={id} isReadOnly={isReadOnly} />
    </HydrationBoundary>
  );
}
