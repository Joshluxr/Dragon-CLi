import { getAdminUserOrThrow } from "@/lib/auth-server";
import { AdminSlackMessageDebugger } from "@/components/admin/slack";

export default async function AdminSlackPage() {
  await getAdminUserOrThrow();
  return <AdminSlackMessageDebugger />;
}
