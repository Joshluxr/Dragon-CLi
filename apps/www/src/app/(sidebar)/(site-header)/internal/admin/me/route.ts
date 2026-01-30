import { adminOnly } from "@/lib/auth-server";
import { User } from "@dragon/shared";
import { redirect } from "next/navigation";

/**
 * Redirects to the current admin user's profile page
 * Route: /internal/admin/me -> /internal/admin/user/{userId}
 */
export const GET = adminOnly(async function GET(adminUser: User) {
  redirect(`/internal/admin/user/${adminUser.id}`);
});
