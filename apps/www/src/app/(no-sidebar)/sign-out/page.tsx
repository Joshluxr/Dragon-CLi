"use client";

import { useEffect } from "react";
import { signOut } from "@/components/auth";

/**
 * Sign-out page that triggers POST to Better Auth (which only accepts POST for sign-out).
 * Direct links to /api/auth/sign-out use GET and return 404.
 */
export default function SignOutPage() {
  useEffect(() => {
    signOut();
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Signing out…</p>
    </div>
  );
}
