import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const authHandler = toNextJsHandler(auth.handler);

/**
 * Better Auth's sign-out only accepts POST. GET requests (e.g. from <a href>) return 404.
 * - GET: redirect to /sign-out page which triggers the client-side POST
 * - POST: forward to Better Auth
 */
export async function GET(request: NextRequest) {
  const url = new URL("/sign-out", request.url);
  return NextResponse.redirect(url, 302);
}

export const POST = authHandler.POST;
