import { validInternalRequestOrThrow } from "@/lib/auth-server";
import { runScheduledThread } from "@/server-lib/scheduled-thread";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ userId: string; threadId: string; threadChatId: string }>;
  },
) {
  await validInternalRequestOrThrow();
  const { userId, threadId, threadChatId } = await params;
  console.log("processScheduledTask", { userId, threadId, threadChatId });
  await runScheduledThread({ userId, threadId, threadChatId });
  return NextResponse.json({ message: "ok" });
}
