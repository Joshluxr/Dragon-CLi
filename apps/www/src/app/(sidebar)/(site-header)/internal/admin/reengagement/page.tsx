import { getAdminUserOrThrow } from "@/lib/auth-server";
import { ReengagementContent } from "@/components/admin/reengagement-content";

export default async function AdminReengagementPage() {
  await getAdminUserOrThrow();
  return <ReengagementContent />;
}
