import { RPCHandler } from "@orpc/server/fetch";

import { cliRouter } from "@/server/orpc/cli-router";

const handler = new RPCHandler(cliRouter);

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "X-Daemon-Token, Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: "/api/cli",
    context: {
      headers: request.headers,
      // @ts-expect-error - This gets set in the middleware
      userId: null,
    },
  });

  const res = response ?? new Response("Not found", { status: 404 });
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
