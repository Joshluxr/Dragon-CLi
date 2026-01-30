import {
  BroadcastChannelUser,
  BroadcastUserMessage,
  getBroadcastChannelStr,
} from "@dragon/types/broadcast";
import { env } from "@dragon/env/pkg-shared";
import { publicBroadcastUrl } from "@dragon/env/next-public";

export async function publishBroadcastUserMessage(
  message: BroadcastUserMessage,
) {
  // Skip publishing broadcast messages in tests
  if (process.env.NODE_ENV === "test") {
    return;
  }
  const partySocketUrl = publicBroadcastUrl();
  if (!partySocketUrl) {
    console.warn("Party socket URL not set");
    return;
  }
  const channel: BroadcastChannelUser = {
    type: "user",
    id: message.id,
  };
  await fetch(
    `${partySocketUrl}/parties/main/${getBroadcastChannelStr(channel)}`,
    {
      method: "POST",
      body: JSON.stringify(message),
      headers: {
        "X-Dragon-Secret": env.INTERNAL_SHARED_SECRET!,
      },
    },
  );
}
