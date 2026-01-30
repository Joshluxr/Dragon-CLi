import { AdminMain } from "@/components/admin/main";
import { getAdminUserOrThrow } from "@/lib/auth-server";

export default async function AdminMainPage() {
  await getAdminUserOrThrow();
  return <AdminMain />;
}
