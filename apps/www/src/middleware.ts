import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { searchParams, pathname } = new URL(request.url);
  const accessCode = searchParams.get("code");

  // Only process if we have an access code and we're on a public page
  if (
    accessCode &&
    (pathname === "/" || pathname === "/login" || pathname === "/invited")
  ) {
    // Create response to continue to the page
    const response = NextResponse.next();

    // Set the access code as a cookie
    response.cookies.set("access_code", accessCode, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    // Remove the code from the URL to keep it clean
    const url = new URL(request.url);
    url.searchParams.delete("code");

    // Redirect to the clean URL
    return NextResponse.redirect(url, {
      headers: response.headers,
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/invited"],
};
