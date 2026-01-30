import { NextRequest } from "next/server";

export async function GET(_request: NextRequest) {
  console.log("Sleeping for 15 minutes");
  await new Promise((resolve) => setTimeout(resolve, 15 * 60 * 1000));
  return new Response("Hello, world!");
}
