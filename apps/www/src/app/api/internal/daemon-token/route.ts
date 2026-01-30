import { auth } from "@/lib/auth";
import { nanoid } from "nanoid/non-secure";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdOrNull } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("This endpoint is only available in development");
  }
  const userId = await getUserIdOrNull();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = await auth.api.createApiKey({
    body: {
      name: `daemon-token-${nanoid()}`,
      expiresIn: 60 * 60 * 24 * 30, // 30 days,
      userId,
    },
  });
  return NextResponse.json({
    token: token.key,
  });
}
