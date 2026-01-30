import { getAdminUserOrThrow } from "@/lib/auth-server";
import { AdminGithubAppTester } from "@/components/admin/github";

export default async function AdminGithubAppTesterPage() {
  await getAdminUserOrThrow();
  return <AdminGithubAppTester />;
}
